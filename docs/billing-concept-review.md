# CloudNest Billing System — Concept & Code Quality Review

---

## 1. Executive Summary

CloudNest's billing system is **not production-ready for real paying customers**.
Approximately 60% of the backend logic exists and works, but two
blocking gaps — the subscribe flow never provisions a VM, and the
suspension flow never stops a VM on Proxmox — mean the core loop
(charge → suspend → resume) is broken in both directions. The frontend
is surprisingly complete for a 60%-built backend: every billing section
renders real data and the UX is consistent. But the backend's
architectural discipline has eroded: cross-module Prisma access is
common, 5 of 8 billing modules shape HTTP responses in the service
layer, and several critical features (plan proration, low-balance
warnings, payment gateway) are entirely absent. The system is further
along than a stub but is in the dangerous middle zone where it looks
more complete than it really is.

---

## 2. Lifecycle Walkthrough Findings

### Step 1: Sign Up → Registration

**Backend:** ✅ Complete. `AuthService.register()` accepts an optional
`referralCode` and calls `ReferralsService.redeemReferral()` in the
registration transaction. Failure is logged but swallowed (the user
registers successfully even if referral redemption fails silently).

**Frontend:** 🟡 **Gap.** The registration form has no referral code
input field and never sends `referralCode`. A visitor who has been
given a referral code cannot enter it during signup. They must
register first, then navigate to `/dashboard/billing/referrals` and
manually redeem the code there. This splits what should be a single
conversion flow into two disconnected steps.

### Step 2: Get a Redeem Code (Voucher)

**Backend:** ✅ Admin creation works. No public/self-service path.

**Frontend:** ✅ Admin voucher CRUD page exists. Customer redemption
form exists on the billing overview page.

**Gap — no distribution mechanism:** There is no automated way for a
customer to receive a voucher code. No signup bonus, no "request a
trial" endpoint, no bulk-creation UI, no marketing integration. A
voucher code exists only because an admin manually created it and
manually communicated it (email, chat, etc.) to the customer. This is
not a code gap — it is a product gap. The system has no customer
acquisition funnel.

### Step 3: Redeem Code → Wallet Credited

**Backend:** ✅ Complete. The redeem → credit → auto-resume flow is
the best-tested path in the billing system. Atomic `updateMany` with
optimistic lock, unique constraint on `[voucherId, userId]` preventing
double-redeem, audit log in the same transaction, and auto-resume of
suspended VMs after the transaction commits.

**Frontend:** ✅ Complete. Inline form on billing overview page.

### Step 4: Browse Plans

**Backend:** ✅ Plans, categories, coupons all served.

**Frontend:** 🟡 **Gap — no affordability indicator.** The plans page
shows prices but not the user's current wallet balance. A user sees
"$50.00 / 30d" with no way to check "do I have enough?" without
navigating to a different page. The first indication of insufficient
funds is a 400 error when they click Subscribe. This is a UX failure
that will produce confused customers.

### Step 5: Buy a VM

**Backend:** 🔴 **BLOCKING — two paths, both broken in complementary
ways.**

**Path A: Subscribe to Plan** (`SubscriptionsService.subscribe()`):
✅ Debits wallet for first period. ✅ Creates subscription + VM record
+ pool allocation + IP + audit log in one transaction.
❌ **Does NOT enqueue a create-vm BullMQ job.** The VM is saved to the
database with `proxmoxId: null` and `status: 'provisioning'` but
nothing ever provisions it. It stays in `provisioning` state forever
unless an admin manually runs `POST /admin/vms` to create it.

**Path B: Create VM Directly** (`VmService.createVm()`):
✅ Enqueues a create-vm BullMQ job that actually provisions on Proxmox.
❌ **Does NOT check wallet balance.** A user with $0 balance and an
active subscription can create unlimited VMs (until resource pool
exhaustion), accruing unbillable usage hours.

**Net result:** One path takes money but doesn't deliver a VM. The
other delivers a VM but doesn't take money. Both paths silently fail
to complete the customer's intent.

### Step 6: Balance Runs Low → Suspension

**Backend:** 🟡 **Missing actual Proxmox suspension.**

The hourly billing tick (`BillingService.billVm()`) tries to debit the
wallet. On failure it calls `enterGracePeriod()`, which:
- ✅ Sets `vm.status = 'suspended'` and `vm.suspendedAt = now` in DB
- ✅ Writes audit log
- ❌ **Does NOT stop the VM on Proxmox.** The VM keeps running.
- ❌ **Does NOT notify the user.** No email, no in-app notification,
  no dashboard banner — the VM just stops appearing in the user's
  active list, but it's still consuming Proxmox resources and accruing
  cost to the provider.

The `subscription-grace-period` job runs every 30 minutes and looks
for VMs in grace_period > 72 hours. It sets them to `cancelled` and
stops billing. Again, ❌ **does NOT stop the VM on Proxmox.**

**Frontend:** 🟡 The subscriptions page shows a `suspended` status
badge. There is no banner, no "top up to resume" CTA, no countdown
timer showing how much grace period remains.

**Low-balance warnings:** ⚫ **Not implemented.** There is no mechanism
to warn a user before their balance hits zero. No notification trigger
at 20% remaining, no email, no dashboard alert. The VM goes from
"running" to "suspended" with zero advance notice.

### Step 7: Resume After Top-Up

**Backend:** 🟡 **Partially automatic — best-effort, not guaranteed.**

`WalletService.credit()` calls `autoResumeSuspendedVms()` after each
credit transaction commits. This enqueues `resume-vm` BullMQ jobs for
any of the user's VMs that are in `suspended` status with a
`grace_period` subscription.

**What works:** The resume-vm consumer calls `ProxmoxService.startVm()`
which actually starts the VM on Proxmox. Audit log written.

**What does NOT work:**
1. **The check is best-effort only.** `autoResumeSuspendedVms()` runs
   in a try/catch that silently swallows all errors. If the job
   enqueue fails (BullMQ down, Redis unreachable), the user is never
   told and their VM stays suspended. No retry, no alert.
2. **Only triggered by `credit()`.** If an admin credits the wallet
   via the `POST /admin/users/:id/credit` path, `autoResumeSuspendedVms`
   is NOT called because `AdminService.creditUserWallet()` calls
   `walletService.credit()` ... actually wait, let me check. The admin
   service's `creditUserWallet` calls `adminRepo.upsertWallet()` and
   `adminRepo.createTransaction()` directly, bypassing
   `WalletService.credit()`. So top-ups via the admin route will NOT
   trigger auto-resume. This is a bug — admin-credited users stay
   suspended unless they also redeem a voucher or manually trigger a
   resume.
3. **No periodic sweep.** There is no recurring job that checks "should
   any suspended VMs be resumed now?" The auto-resume only fires as a
   side effect of a credit. If the side effect fails (error swallowed),
   there is no recovery path.

### Step 8: Referral

**Backend:** ✅ Complete. Code generation, redemption, dual-credit
(referrer + referee), audit log, self-referral prevention.

**Frontend:** ✅ Complete. Code generation button, copy-to-clipboard,
stats display, redeem form, shareable registration link. This is the
most end-to-end-complete billing feature.

---

## 3. Funding Model Viability Verdict

**The funding model — redeem-only + admin-credit-only — is not viable
for a production service with real paying customers.**

The honest answer: **as of today, a customer cannot pay CloudNest
money to get service.** Here is what would actually happen:

1. A potential customer visits the landing page. Sees "Start Free."
   Clicks it. Registers.
2. They have \$0 balance. They browse plans at \$50/month. They click
   Subscribe. They get a 400 error: "Insufficient balance."
3. Now what? There is no "Add Funds" button. No credit card form. No
   PayPal. No bank transfer instructions. No "request a voucher" link.
4. The customer must contact support (email, Discord, etc.). An admin
   manually creates a voucher code or directly credits the wallet via
   `POST /admin/users/:id/credit`. The admin communicates the code to
   the customer out of band. The customer redeems it. Then they can
   subscribe.

This is a **business-process gap, not a code gap**. The code does what
it was designed to do. The design simply has no customer payment path.
The voucher system, as implemented, is a **testing and promotional
tool**, not a revenue collection mechanism. At any real scale — even
10 paying customers — this breaks down immediately.

The redeem-code distribution channel does not exist in the product. An
admin generating codes for themselves or for testing is the only usage
pattern the code supports today.

---

## 4. Pricing / Plan Sanity Findings

### 4.1 Global hourly rates vs. per-plan prices

The billing system has **two parallel and inconsistent pricing
models**:

**A. Per-plan subscription pricing:** Each plan has `priceCredits` and
`billingPeriodDays`. A plan priced at 5000 credits / 30 days costs
5000 cents (≈ \$5.00) per month. The subscribe flow charges this
upfront.

**B. Global hourly usage rates** (hardcoded in `billing.service.ts`):
`VM_PRICE_PER_CORE_HOUR = 50`, `VM_PRICE_PER_GB_MEM_HOUR = 10`,
`VM_PRICE_PER_GB_DISK_HOUR = 2` (cents). The hourly billing tick
calculates cost from actual VM resources, NOT from the plan price.

**These two models are not reconciled.** A plan priced at 5000 cents
for 30 days (5.5 cents/hour for a 1-core/1GB/25GB VM) would be billed
at `50*1 + 10*1 + 2*25 = 110` cents/hour by the usage model. The
subscription charges 5.5 cents/hour; usage billing charges 110
cents/hour — **20x difference**.

A customer who subscribes at the plan price gets charged again at the
usage price, because the subscription debit is a one-time upfront
charge, and the hourly billing tick runs independently and debits
separately for the same VM. The subscription upfront payment is
effectively a setup fee, and the hourly billing is the recurring cost.
**There is no documentation anywhere explaining this two-model system
to users or admins.**

### 4.2 Proration

⚫ **Not implemented.** The `Plan` model has `allowedUpgradePlanIds`
and `allowedDowngradePlanIds` fields, suggesting proration was
planned. The `SubscriptionsService.changePlan()` method exists and
enqueues a `resize-vm` job for disk changes, but there is no proration
calculation anywhere. The customer pays the full price of the new plan
at change time, with no credit for unused time on the old plan.

### 4.3 Plans referenced by frontend but not in DB

No mismatch found. All plan IDs used by the frontend are fetched from
the API at runtime. The admin plan CRUD page creates plans in the DB,
and the customer plans page reads them from the API. No hardcoded plan
IDs in the frontend.

---

## 5. Completeness Scorecard

| Feature | Backend | Frontend | Tested | Verdict |
|---------|---------|----------|--------|---------|
| Plan mapping (changePlan → resize job) | ✅ | 🟡 (no change-plan UI) | ✅ (1 test) | 🟡 Partial — API works but user cannot trigger it |
| Pre-provisioning balance check (sub path) | ✅ | 🟡 (no affordability shown) | ✅ | 🟡 Wallet check exists but blocks permanently if insufficient |
| Pre-provisioning balance check (direct create) | ❌ | ❌ | ❌ | 🔴 **Wallet check missing — can create VMs with \$0** |
| Resource add-ons (VM level) | ✅ | ✅ | ❌ | 🟡 No tests, hardcoded frontend prices |
| Store resource packages | ✅ | ✅ | ❌ | 🟡 No tests |
| Subscription UI (list, cancel, renew) | ✅ | ✅ | ❌ | 🟡 No tests on critical financial operations |
| Suspension (DB state) | ✅ | 🟡 | ❌ | 🟡 DB state changes work, no Proxmox action, no notification |
| Grace period processing | ✅ | ❌ | ❌ | 🟡 Timer-based processing works, no UI feedback |
| Auto-resume on payment | 🟡 | ❌ | ✅ (1 test) | 🟡 Admin credit path bypasses auto-resume |
| Referrals | ✅ | ✅ | ❌ | 🟡 Complete code, zero tests |
| Redeem codes (vouchers) | ✅ | ✅ | ✅ (11 tests) | ✅ Most complete billing feature |
| Invoices | ✅ | ✅ | ❌ | 🟡 No tests, but works end-to-end |
| Payment gateway | ⚫ | ⚫ | ⚫ | ⚫ **Not implemented — cannot add money** |
| Low-balance warnings | ⚫ | ⚫ | ⚫ | ⚫ **Not implemented — zero notification** |
| Plan proration | ⚫ | ⚫ | ⚫ | ⚫ **Not implemented** |
| Public pricing page | ⚫ | ⚫ | ⚫ | ⚫ **Not implemented — pricing is login-gated** |

---

## 6. Architecture Compliance Findings

### 6.1 Four-layer separation

Every billing module has the four layers (controller → service →
repository → Prisma). However, the following violations were found:

**HTTP-response shaping in service layer (5 of 8 modules):**
- Voucher: `processCredits`, `processPlanTrial`, `processPlanCoupon`
  return `{ message: "...", amount: N }` objects
- Referrals: `redeemReferral` returns shaped response object
- Subscriptions: `adminRefundSubscription` returns shaped response
- VM Addons: `purchaseAddOn` returns shaped response
- Admin: `creditUserWallet` shapes notification message

The service layer should return plain domain data. Response messages
and HTTP-specific shapes belong in the controller or a dedicated
response-mapping layer.

**Cross-module Prisma model access (4 modules violating Rule #11):**
- VoucherRepository creates `subscription` records directly (should go
  through `SubscriptionsService`)
- VoucherRepository queries `plan` table directly (should go through
  `PlansService`)
- VmAddonsRepository queries `vm` table directly (should go through
  `VmService`)
- AdminRepository creates `wallet`, `transaction`, `vm`, and other
  models directly instead of going through each module's service

**Direct Prisma access from services bypassing repository:**
- ReferralsService calls `this.prisma.setting.upsert()` directly
  instead of using ReferralsRepository
- SubscriptionsService calls `tx.vm.update()` directly for suspension
  instead of going through VmService or its own repository

### 6.2 Dependency-cruiser

**MISSING.** No `.dependency-cruiser.{js,ts}` config exists anywhere
in the project. There is no automated enforcement of module boundaries.
All the cross-module violations above have no CI guard.

### 6.3 Idempotency compliance (Rule #4)

**Partial.** `ProxmoxJobService.enqueueJob()` supports idempotency
keys via `IdempotencyKeyRepository`. However:

- **❌ The hourly billing tick** (`runHourlyBilling`) has no
  idempotency protection. If the job runs twice (crash + restart before
  completion), VMs can be double-billed for the same hour.
- **❌ Voucher redemption** has no idempotency key against retries.
  The `@@unique([voucherId, userId])` constraint and atomic
  `updateMany` guard prevent the worst case, but a network retry that
  times out after the transaction commits would produce a 500 error
  (unique constraint violation) instead of a graceful idempotent response.
- **✅ All Proxmox mutation jobs** (create, delete, start, stop,
  resize, snapshot, backup) use idempotency keys — these are compliant.

### 6.4 Audit logging (Rule #5)

**Pervasive violation.** See `docs/ARCHITECTURE_AUDIT.md` for the full
catalog. Key billing-specific gaps:
- Voucher redemption writes an audit log but the `redeemVoucher`
  method does this **outside** the `$transaction` callback — the audit
  log write at line 134 of `voucher.service.ts` is in `processCredits`
  which is called INSIDE the transaction (line 127). Correct.
- However, `WalletService.credit()` writes its OWN audit log (line
  54-62) inside its own transaction, and then `processCredits()` also
  writes an audit log (line 134) in the voucher's outer transaction.
  This produces TWO audit log entries for a single voucher redemption.
- No centralized `AuditService` — every audit log is a direct
  `this.prisma.auditLog.create()` call.
- The `ipAddress` column in the AuditLog schema is never populated.

---

## 7. Test Coverage Report

### Coverage per billing module (from `npx jest --coverage`)

| Module | Line % | Branch % | Func % | Tests | Actual service coverage |
|--------|--------|----------|--------|-------|------------------------|
| wallet | 54.11% | 55.55% | 39.13% | 7 | ~86% (wallet.service.ts) |
| voucher | 40.71% | 51.92% | 38.23% | 11 | ~56% (voucher.service.ts) |
| billing | 27.88% | 8.19% | 19.23% | 8 | ~56% (billing.service.ts) |
| admin | 19.13% | 5.00% | 13.24% | 17 | ~31% (admin.service.ts) |
| referrals | 10.74% | 0.00% | 0.00% | **0** | 0 tests |
| subscriptions | 5.07% | 0.00% | 0.00% | **0** | 0 tests |
| plans | 4.29% | 0.00% | 0.00% | **0** | 0 tests |
| vm-addons | 0.00% | 0.00% | 0.00% | **0** | 0 tests |

### Key findings

1. **4 billing modules have ZERO tests:** `subscriptions` (544 lines),
   `plans` (353 lines), `referrals` (206 lines), `vm-addons` (105
   lines). These are the modules that handle money — the most critical
   code to test.

2. **Admin service has the largest coverage gap among tested modules:**
   ~31% line coverage on a 962-line file with ~22 public methods, only
   ~9 tested. The untested methods include all VM admin operations,
   node management, and the billing-pricing endpoints.

3. **No fake tests found.** All 43 tests across 4 spec files have
   specific `expect()` assertions. This is good — the tests that exist
   are meaningful.

4. **No characterization tests exist** for pre-existing code. When the
   wallet and subscription code was modified during the billing
   implementation, no "record existing behavior before changing" tests
   were written.

5. **No integration or e2e tests.** All 286 tests are unit tests with
   in-memory stores. There is no test that exercises the full
   subscribe → charge → suspend → resume flow against a real or
   containerized database.

---

## 8. Error Handling Gap List

### 8.1 No global exception filter

The application has **zero** global filters or interceptors:
- No `PrismaClientExceptionFilter` — Prisma errors (unique constraint
  violations, record not found, connection failures) surface as 500
  errors with NestJS's default stack-trace-in-body behavior in
  development. In production, NestJS suppresses stack traces, but the
  error shape is uncontrolled.
- No logging interceptor — no automatic request/response logging.
- No timeout interceptor — long-running DB queries or BullMQ enqueues
  that hang will hang the HTTP request until the underlying driver
  times out (often 30-120 seconds).

### 8.2 Per-endpoint error coverage

| Endpoint | DB failure mid-tx | Proxmox unreachable | BullMQ stuck | Malformed input |
|----------|-------------------|---------------------|--------------|-----------------|
| `POST /vouchers/redeem` | ❌ Prisma error → 500 | N/A | N/A | ✅ ValidationPipe |
| `POST /subscriptions` | ❌ Prisma error → 500 | N/A (no Proxmox call) | N/A | ✅ ValidationPipe |
| `POST /wallet/debit` | ❌ Prisma error → 500 | N/A | N/A | ✅ ValidationPipe |
| `POST /admin/users/:id/credit` | ❌ Prisma error → 500 | N/A | N/A | ✅ ValidationPipe |
| `POST /vms` (create) | ❌ Prisma error → 500 | N/A (enqueues job) | ❌ Timeout on enqueue → 500 | ✅ ValidationPipe |
| `POST /vms/:id/addons` | ❌ Prisma error → 500 | ❌ Unhandled Proxmox error → 500 | ❌ | ✅ ValidationPipe |
| `POST /referrals/redeem` | ❌ Prisma error → 500 | N/A | N/A | ✅ ValidationPipe |
| `GET /billing/estimate/:vmId` | ❌ Prisma error → 500 | N/A | N/A | ✅ (UUID validation) |

**Every single billing endpoint** would return a 500 with an
uncontrolled error body if its database transaction fails mid-way
through. No endpoint catches Prisma `NotFoundError` (P2025) — which
would occur if a referenced record is deleted between the existence
check and the mutation — so these would also surface as 500.

### 8.3 Stack trace leakage

In production mode (`NODE_ENV=production`), NestJS's default exception
filter suppresses stack traces from 500 responses. The error message
is still returned. In development mode, full stack traces leak to the
client on every unhandled Prisma error.

---

## 9. Data Model Findings

### 9.1 Money types

✅ All money fields are `Int` (minor units — cents). No `Float` usage.
Compliant with Rule #2.

### 9.2 Free-text enums

❌ **5 billing models use free-text `String` for status/type fields
that should be Prisma enums:**
- `Transaction.type` → should be `TransactionType` enum (`credit | debit`)
- `Invoice.status` → should be `InvoiceStatus` enum (`draft | paid | pending | overdue | cancelled`)
- `Subscription.status` → should be `SubscriptionStatus` enum (`pending | active | suspended | cancelled | expired | grace_period`)
- `VoucherCode.rewardType` → should be `RewardType` enum (`credits | plan_trial | plan_coupon`)
- `VoucherCode.couponScope` → should be `CouponScope` enum (`initial | renewal | both`)

Free-text strings allow invalid data to enter the system via direct DB
writes, migration mistakes, or bugs. Prisma enums enforce valid values
at the database level.

### 9.3 Missing indexes

The following queries are run by the billing system on a recurring
basis. The tables they query lack indexes, meaning they degrade to
sequential scans at scale:

| Query | Run by | Frequency | Missing index |
|-------|--------|-----------|---------------|
| `vm.findMany({ where: { status: 'running' }, include: { user: true, subscription: true } })` | `BillingService.runHourlyBilling()` | Every hour | `@@index([status])` on `Vm` |
| `invoice.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })` | `BillingService.listInvoices()` | On every billing page load | `@@index([userId])` on `Invoice` |
| `transaction.findMany({ where: { walletId }, orderBy: { createdAt: 'desc' } })` | `WalletService.listTransactions()` | On every wallet load | `@@index([walletId])` on `Transaction` |
| `subscription.findMany({ where: { userId, status: 'active' } })` | `SubscriptionsService.getUserSubscriptions()` | On every subscriptions page load | `@@index([userId, status])` on `Subscription` |
| `subscription.findMany({ where: { nextRenewalAt: { lte: now }, status: 'active' } })` | `SubscriptionsService.renewAllDue()` | Every hour | `@@index([status, nextRenewalAt])` on `Subscription` |

### 9.4 Cascade behavior

❌ **No billing model specifies `onDelete` cascade behavior.** Prisma's
default is `Restrict` (prevents deletion of referenced record). This
means:

- If a `User` is deleted, their `Wallet`, `Subscription`, `ReferralCode`,
  `VoucherRedemption`, `Invoice`, and `ResourcePackagePurchase` records
  block the deletion (foreign key violation).
- There is no cleanup strategy. `User.delete` will fail if the user has
  any billing history.
- This is arguably correct behavior (never silently delete financial
  records), but the lack of explicit cascade configuration means the
  behavior is implicit and could surprise a developer who assumes
  `SetNull` or `Cascade`.

### 9.5 Nullable fields

**`Transaction.reference` is optional but often omitted.** The debit
flow in subscription renewal passes `undefined` as reference (from
`subsService.renewSubscription` calls `walletService.debit()` without
a reference). This makes it impossible to trace what a debit was for
by looking at the transaction record alone.

---

## 10. Consistency and Naming Findings

### 10.1 Naming conventions

**Mixed styles across modules:**

- **Wallet, Voucher, Plans, VM Addons:** Use `@CurrentUser('id')` to
  get the authenticated user — ✅ consistent with AGENTS.md convention
- **Referrals:** Uses `@Req() req: any` then `req.user.id` — ❌
  different from every other module, harder to test
- **Controllers:** All use `@ApiTags`, `@ApiBearerAuth`, `@UseGuards`
  — ✅ consistent
- **DTO naming:** `CreateVoucherDto`, `RedeemVoucherDto`,
  `SubscribeDto`, `PurchaseAddOnDto`, `CreditWalletDto` — ✅ PascalCase
  with meaningful names
- **Method naming:** `creditUserWallet()`, `redeemVoucher()`,
  `getOrCreateWallet()` — ✅ consistent imperative style

### 10.2 Code formatting

No auto-formatter config found. Files use a mix of 2-space and 4-space
indentation across different modules. Some files have inconsistent
semicolons. This is cosmetic but indicates no `prettier` or `eslint`
with `--fix` in the CI pipeline.

### 10.3 Conventional Commits compliance

**✅ Compliant.** The last 8 commits use the Conventional Commits
format:

```
feat(billing): auto-resume VMs when user adds wallet funds
feat(billing): auto-refund wallet on provision failure
feat(plans): trigger Proxmox resize job on plan change
feat(vm-addons): add purchase UI on VM detail page
security(billing): fix 6 audit findings across wallet/voucher/referral/admin
```

All use lowercase, no trailing period, and match the `<type>(<scope>):
<summary>` format.

---

## 11. Documentation Gap List

### 11.1 Module-level READMEs

**❌ Zero module READMEs exist.** Not a single billing module
(`wallet/`, `voucher/`, `referrals/`, `subscriptions/`, `plans/`,
`billing/`, `vm-addons/`) has a README.md. AGENTS.md requires
"AGENTS.md-compatible module docs exist for every billing feature."
This requirement was not fulfilled for any feature.

### 11.2 ARCHITECTURE_AND_SECURITY_RULES.md is misnamed

The file at `docs/ARCHITECTURE_AND_SECURITY_RULES.md` (48 lines) is a
security checklist, not an architecture governance document. The actual
architecture rules (four-layer separation, module boundaries, etc.) are
defined in `docs/ARCHITECTURE_AUDIT.md` (329 lines) — which is an
audit report, not a governance document. There is no authoritative,
single-file architecture standard. Developers must read AGENTS.md +
ARCHITECTURE_AUDIT.md + CloudNest_Master_Plan.md to piece together
the rules.

### 11.3 Swagger annotations

**Present but incomplete:**

- ✅ All controllers have `@ApiTags` and `@ApiOperation({ summary })`
- ✅ All DTOs have `@ApiProperty` or `@ApiPropertyOptional`
- ❌ No controller has `@ApiResponse`, `@ApiBadRequestResponse`,
  `@ApiNotFoundResponse`, or `@ApiForbiddenResponse` — API consumers
  cannot determine what status codes each endpoint returns
- ❌ No `@ApiParam` annotations on route parameters (`:id`, `:vmId`)
- ❌ No `@ApiQuery` annotations on query parameters
- ❌ Some DTOs have minimal descriptions (e.g., `DebitDto.amount` is
  just `@ApiProperty()` with no description)
- ❌ The `CreditDto` was removed during the security audit, but its
  Swagger definition disappeared without replacement documentation for
  the admin credit flow

### 11.4 Developer onboarding

**❌ No CONTRIBUTING.md, no SETUP.md, no developer onboarding guide.**
The only setup instructions are in the Prisma schema comments and the
`.env.example` file.

---

## 12. Prioritized Fix List

Ranked by **business risk × effort to fix** (highest priority first):

| # | Finding | Risk | Effort | Category |
|---|---------|------|--------|----------|
| 1 | Subscribe flow does not enqueue create-vm job → VM stuck in provisioning forever | **Critical** — customers pay but receive nothing | Small (1-2 lines in SubscriptionsService) | Bug |
| 2 | Suspension does not stop VM on Proxmox → VM runs unbilled forever | **Critical** — revenue leakage + resource theft | Small (enqueue stop-vm job) | Bug |
| 3 | Direct VM creation does not check wallet balance → unbillable debt | **Critical** — can create VMs with \$0 | Small (add wallet check before enqueue) | Bug |
| 4 | Admin credit bypasses auto-resume → user stays suspended after manual top-up | **High** — admin-credited users stay suspended | Small (call autoResumeSuspendedVms from admin path) | Bug |
| 5 | No global exception filter → Prisma errors leak as 500 | **High** — observability gap | Medium (add PrismaClientExceptionFilter) | Hardening |
| 6 | Hourly billing tick has no idempotency → double-bill on retry | **High** — double-charges customers | Medium (add idempotency key to billing tick) | Bug |
| 7 | 4 billing modules have zero tests | **High** — financial code untested | Large (add tests for subscriptions, plans, referrals, vm-addons) | Quality |
| 8 | Dual pricing model (plan price + hourly usage) not reconciled or documented | **High** — customers and admins cannot understand charges | Medium (document the two-model system, or reconcile them) | Design |
| 9 | No payment gateway → customers cannot pay money for service | **High** — product blocker without it | Very large (add Stripe/PayPal module) | Feature gap |
| 10 | HTTP-response shaping in 5 service layers | **Medium** — maintenance burden, not a bug | Medium (move response shaping to controllers) | Architecture |
| 11 | Cross-module Prisma access in 4 modules | **Medium** — fragile boundaries, not a bug | Large (refactor to go through module services) | Architecture |
| 12 | No affordability indicator on plans page | **Medium** — bad UX, not a financial risk | Small (add wallet balance display to plans page) | UX |
| 13 | Low-balance warnings absent | **Medium** — customers surprised by suspension | Medium (add notification trigger at 20% balance) | Feature gap |
| 14 | Free-text enums in 5 models | **Medium** — data integrity risk | Medium (add Prisma enums + migration) | Data quality |
| 15 | Missing indexes on 5 query patterns | **Medium** — performance at scale | Small (add @@index migrations) | Performance |
| 16 | Registration form missing referral code field | **Low** — alternative path exists | Small (add input field to register form) | UX |
| 17 | No dependency-cruiser config | **Low** — no CI guard | Small (add config based on architecture rules) | Tooling |
| 18 | No module READMEs | **Low** — developer convenience | Medium (write module docs) | Documentation |
| 19 | Swagger missing @ApiResponse annotations | **Low** — API client convenience | Medium (add error response annotations) | Documentation |
| 20 | `GET /billing/estimate/:vmId` lacks ownership check | **Low** — informational, not financial |
