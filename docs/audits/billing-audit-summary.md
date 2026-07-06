# FeatherPanel Billing Plugin Suite — Audit Summary

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                      FeatherPanel Core                          │
│  (Symfony HttpFoundation, PDO, PluginSettings, AppPlugin,       │
│   Server/Wings API, Activity logging, Auth events)              │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │  billingcore (Foundation)     │
              │  • Credits/Wallet (integers)  │
              │  • Invoices + Items           │
              │  • User billing info          │
              │  • Currency display           │
              └──────────────┬──────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
  │ billingplans  │  │ billingresources│  │ billingredeem │
  │ Subscriptions │  │ User resources │  │ Coupon codes  │
  │ Plan lifecycle│  │ Limits/tracking │  │ Rewards        │
  │ Renewal cron  │  │ Used/available │  │ Credit/plan    │
  │ Gateway (ext) │  └───────┬───────┘  └───────────────┘
  └───────┬───────┘          │
          │                  │
          └──────────────────┼──────────────────┐
                             │                  │
                             ▼                  ▼
                    ┌───────────────┐  ┌───────────────────┐
                    │ billingresources│  │ billingresources │
                    │ store          │  │ new-servers      │
                    │ Package/iNDIV. │  │ Self-service     │
                    │ storefront    │  │ server creation  │
                    └───────────────┘  └───────────────────┘

  ┌───────────────┐
  │ billingrefs   │
  │ Referral codes│
  │ Credit awards │
  │ (depends on   │
  │ billingcore + │
  │ billingplans) │
  └───────────────┘
```

### Dependency Table

| Plugin | Depends On | Imported Classes |
|--------|-----------|------------------|
| **BillingCore** | (none — foundation) | Framework `PluginSettings`, `Activity` |
| **BillingPlans** | billingcore | `CreditsHelper`, `BillingHelper`, `CurrencyHelper`, `Invoice::create()` |
| **BillingResources** | billingcore | `PluginSettings` (for settings), `CreditsHelper` |
| **BillingResourcesStore** | billingcore, billingresources | `CreditsHelper`, `ResourcesHelper`, `BillingHelper`, `CurrencyHelper` |
| **BillingResourcesNewServers** | billingcore, billingresources | `ResourcesHelper`, `PluginSettings` |
| **BillingReferrals** | billingcore, billingplans | `CreditsHelper`, `Plan` (conditional), `RedeemCode` (conditional) |
| **BillingRedeem** | billingcore | `CreditsHelper`, conditional on `Plan` from billingplans |

### Plugin Registration Mechanism
All 7 use the same pattern:
1. **`conf.yml`** — manifest with name, identifier, version, dependencies
2. **Main class** (e.g. `BillingCore.php`) — implements `App\Plugins\AppPlugin` with 4 static lifecycle methods: `processEvents()`, `pluginInstall()`, `pluginUpdate()`, `pluginUninstall()`
3. **Routes** — `Routes/{plugin}.php` returns a closure that registers routes via `registerAuthRoute()` / `registerAdminRoute()` on a Symfony `RouteCollection`
4. **Frontend** — Vue 3 SPA in `Frontend/App/`, built to `Frontend/Components/`, sidebar entries from `sidebar.json`
5. **Distribution** — packaged as `.fpa` (password-protected zip) for Mythic Marketplace

---

## Cross-Reference: CloudNest vs. FeatherPanel Plugins

| # | Feature | FeatherPanel Plugin | Applicable to CloudNest? | Notes |
|---|---------|-------------------|--------------------------|-------|
| 1 | **Wallet/credits** (integer balance, per-user) | BillingCore | Yes — CloudNest already has Wallet | CloudNest uses Prisma + integer minor units. FeatherPanel uses raw PDO + `SELECT FOR UPDATE`. Both use integer cents. |
| 2 | **Invoices** (CRUD, line items, tax calc) | BillingCore | Yes — CloudNest already has Invoices | CloudNest uses `Invoice` module. FeatherPanel adds auto-numbering (`INV-YYYYMMDD-XXXXXXXX`), tax auto-recalc, statuses `draft/pending/paid/overdue/cancelled`. |
| 3 | **User billing info** (name, address, VAT) | BillingCore | Partial — CloudNest has BillingProfile | FeatherPanel requires billing info before invoice creation. CloudNest should adopt this pattern. |
| 4 | **Multi-currency display** | BillingCore | No — CloudNest is single-currency | FeatherPanel has ~170 ISO currencies with symbol/formatting. Low priority unless expanding globally. |
| 5 | **Subscription state machine** (active/suspended/cancelled/expired) | BillingPlans | Yes — CloudNest has Subscriptions | FeatherPanel has more detailed lifecycle: grace period, suspension, auto-termination, end-of-term cancellation. CloudNest should adopt the grace/suspend/terminate pipeline. |
| 6 | **Plan definitions** (pricing tiers, resource limits per tier) | BillingPlans | Yes — CloudNest has Plans | FeatherPanel has richer plan model: sliders, up/downgrade targets, multi-node, stock control, card image. CloudNest could extend its Plan model. |
| 7 | **Renewal cron** (credit deduction, server suspend/unsuspend/delete) | BillingPlans | Partial — CloudNest has BullMQ jobs | FeatherPanel uses a cron-based approach; CloudNest uses BullMQ queues. The lifecycle logic (grace → suspend → terminate) is reusable. |
| 8 | **Upgrade/downgrade plans** (with credit delta) | BillingPlans | No — CloudNest doesn't have this | FeatherPanel charges full delta on upgrade, refunds full delta on downgrade, resets billing period. No proration. **CloudNest should implement prorated upgrades/downgrades.** |
| 9 | **Coupon codes on subscription** (discount percent + fixed amount, per-scope) | BillingRedeem + BillingPlans | Yes — CloudNest has Vouchers | FeatherPanel's coupon system supports `initial`/`renewal`/`both` scopes, percent + fixed discounts, plan-linked coupons. CloudNest's voucher module is simpler. |
| 10 | **Payment gateway integration** (Stripe, PayPal, Razorpay) | BillingPlans (external plugins) | Partial — CloudNest has Stripe | Gateway plugins are NOT in this repo — they're separate `.fpa` plugins. CloudNest's Stripe integration should be compared directly. |
| 11 | **Resource pool** (per-user limits for memory, CPU, disk, servers, etc.) | BillingResources | Yes — CloudNest has ResourcePool | FeatherPanel tracks used-from-servers vs. limit. CloudNest uses a similar model. FeatherPanel's `SELECT FOR UPDATE` pattern is a reference for concurrency. |
| 12 | **Resource store** (packages and individual resource purchases with discounts) | BillingResourcesStore | No — CloudNest doesn't have this | FeatherPanel sells resource packs and a-la-carte resources via credits. Three-tier discount system (package / global / bulk). **Potentially valuable for CloudNest.** |
| 13 | **Self-service server creation** (from resource pool) | BillingResourcesNewServers | Partial — CloudNest has VM creation | Key difference: FeatherPanel checks **resource quota only** (no credit check at creation time). CloudNest has a more complex provisioning flow via Proxmox. |
| 14 | **Referral system** (cookie tracking, credit awards at registration) | BillingReferrals | No — CloudNest has Referrals module | FeatherPanel awards credits immediately at registration. Uses `SELECT FOR UPDATE` for concurrency. Cookie-based tracking with configurable lifetime. |
| 15 | **Voucher/redeem code redemption** (credits, plan trials, plan coupons) | BillingRedeem | Yes — CloudNest has Vouchers | FeatherPanel supports 3 reward types: credits, plan trial (free period), plan coupon (discount on sub). CloudNest's voucher system is credits-only. |
| 16 | **Invoice tax calculation** (flat percentage on subtotal) | BillingCore | Yes — CloudNest has similar | Simple flat-rate tax. Both use similar approach. |
| 17 | **Grace period** (days before suspension after failed renewal) | BillingPlans | No — CloudNest doesn't have this | Configurable `grace_period_days` (default 0 = immediate suspend). CloudNest should add this. |
| 18 | **Auto-termination** (days after suspension before server deletion) | BillingPlans | No — CloudNest doesn't have this | Configurable `termination_days` (default 0 = never auto-terminate). CloudNest should add this. |
| 19 | **Suspension email + termination email** | BillingPlans | No — CloudNest doesn't have these | Templates for `billingplans_subscription_suspended` and `_terminated`. CloudNest needs notification templates. |
| 20 | **Admin refund tracking** (running total per subscription) | BillingPlans | **SECURITY CONCERN** | FeatherPanel tracks `admin_credits_refunded_total` as a running sum. Check-then-act race condition in `removeUserCredits` admin endpoint. **Do NOT replicate the race condition.** |
| 21 | **Activity logging on admin actions** | All | Yes — CloudNest has AuditLog | FeatherPanel uses `Activity::createActivity()`. CloudNest uses a dedicated `AuditLog` table in Prisma. CloudNest's approach is better (structured DB, not logs). |
| 22 | **Idempotency keys** | None | No — missing everywhere | **No idempotency key column or check exists in any of the 7 plugins.** CloudNest requires this per AGENTS.md rule #4. |
| 23 | **Floating-point money** | BillingCore (invoices), BillingResourcesStore | **SECURITY CONCERN — do not replicate** | Invoice totals and store prices use `float`/`DECIMAL`. Only wallet/credits use integers. CloudNest already correctly uses integer minor units everywhere. |
| 24 | **SELECT FOR UPDATE** for credit operations | BillingCore, BillingResources, BillingReferrals | Reference | FeatherPanel's atomic `SELECT FOR UPDATE` pattern in transactions is correct and worth keeping as a reference. |

---

## Executive Summary

### What CloudNest Already Does Better
1. **Prisma ORM + structured DB** — FeatherPanel uses raw PDO with manual SQL. CloudNest's Prisma schema provides type safety, migrations, and relations.
2. **Integer minor units for ALL money** — FeatherPanel mixes integers (wallet) with floats (invoices, store prices). CloudNest is consistently integer-only.
3. **BullMQ job queue for async operations** — FeatherPanel uses a 1-minute cron for renewal/termination. CloudNest uses BullMQ with idempotency keys, which is more reliable.
4. **Structured AuditLog** — FeatherPanel uses `Activity::createActivity()` which writes to a generic activity log. CloudNest has a dedicated `AuditLog` Prisma model with action/resource/resourceId/metadata, which is more queryable.
5. **Modular NestJS architecture** — FeatherPanel plugins are tightly coupled (cross-namespace imports like `App\Addons\billingcore\Helpers\CreditsHelper`). CloudNest's strict four-layer architecture prevents this.

### What FeatherPanel Does Better (Learn From)
1. **Subscription state machine with grace/termination lifecycle** — Well-designed cron pipeline with configurable grace period, suspension, and auto-termination. CloudNest should adopt this.
2. **Resource store with discount tiers** — Selling resource packages and a-la-carte resources is a feature CloudNest doesn't have. The three-tier discount system (package/global/bulk) is well-designed.
3. **Upgrade/downgrade plan changes** — CloudNest doesn't support plan changes yet. FeatherPanel's approach is simple (full delta, no proration) but provides a starting point.
4. **Referral system** — Fully transactional, uses `SELECT FOR UPDATE`, awards credits immediately at registration. Good reference implementation.
5. **Coupon code with scoped discounts** — BillingRedeem's `initial`/`renewal`/`both` scopes, percent + fixed discounts, and plan linking is more flexible than CloudNest's current voucher system.
6. **Multi-currency display** — Built-in ISO 4217 list with symbol formatting. Easy to add if needed.

### What's Missing From Both
- **No proration** on plan changes (both charge/refund full delta)
- **No webhook signature verification** in reviewed code (gateway webhooks are in external plugins)
- **No idempotency keys** anywhere (required by CloudNest's AGENTS.md)
- **No usage-based billing** (all flat-rate per period)
- **No dunning/retry logic** beyond a single grace period
- **No invoice PDF generation** (display-only)

### Recommendations for CloudNest
1. **Immediately adopt** the grace/suspend/terminate lifecycle from BillingPlans' cron, mapped to BullMQ jobs
2. **Extend voucher system** to support BillingRedeem's three reward types (credits, plan trial, plan coupon)
3. **Implement upgrade/downgrade plan changes** with **proper proration** (unlike FeatherPanel's full-delta approach)
4. **Consider a resource store** for selling add-on resources a la carte
5. **Do NOT adopt** FeatherPanel's floating-point invoice prices, check-then-act race condition in admin credit removal, or lack of idempotency keys
6. **Do NOT adopt** the cross-plugin direct-service-import pattern — enforce CloudNest's rule #11 (go through module services/domain events only)
