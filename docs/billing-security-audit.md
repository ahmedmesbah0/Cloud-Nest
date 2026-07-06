# Billing Security Audit — CloudNest

## Scope
All billing, wallet, voucher, subscription, referral, add-on, and
suspension/resume code paths. Payment-gateway-specific checks are
intentionally omitted — CloudNest has no payment gateway.

## Severity levels
**Critical** — direct loss of funds, privilege escalation to create money.
**High** — significant attack surface with moderate exploitation cost.
**Medium** — informational leakage, hardening, or design improvement.

---

## Findings

### C-1 Admin self-credit via `/wallet/credit` (removed endpoint)

**Severity:** Critical  
**Status:** Fixed in this session  
**File:** `apps/api/src/wallet/wallet.controller.ts`  
**Desc:** `POST /wallet/credit` used `@CurrentUser('id')` as the target of
the credit, so any admin calling the endpoint credited their own wallet.
No frontend code consumed this endpoint — it was entirely redundant with
`POST /admin/users/:id/credit`.  
**Fix:** Removed the endpoint. Admin credit must go through
`POST /admin/users/:id/credit`, which now blocks self-credit (see C-2).

### C-2 Admin self-credit via `/admin/users/:id/credit` (blocked)

**Severity:** Critical  
**Status:** Fixed in this session  
**File:** `apps/api/src/admin/admin.service.ts:436`  
**Desc:** An admin could pass their own `userId` as the `:id` parameter
to credit their own wallet with no check.  
**Fix:** Added `if (adminUserId === userId) throw ForbiddenException`.
Defense-in-depth: the check lives in the service, not just the controller.

### C-3 Debit race condition (overdraft)

**Severity:** Critical  
**Status:** Fixed in this session  
**File:** `apps/api/src/wallet/wallet.service.ts:98-135`  
**Desc:** `WalletService.debit` read the wallet balance and then,
in a separate Prisma call, decremented it. With PostgreSQL's default
Read Committed isolation, two concurrent debits could both see a
sufficient balance and both proceed, producing a negative balance.  
**Fix:** Replaced read-then-check with an atomic `updateMany` whose
`where` clause includes `balance: { gte: amount }`. If the update
affects 0 rows the debit is rejected. This is the same pattern Prisma
docs recommend for race-safe balance checks.

### C-4 No mandatory reason on admin credit

**Severity:** High  
**Status:** Fixed in this session  
**File:** `apps/api/src/admin/dto/admin.dto.ts:35-40`  
**Desc:** `CreditWalletDto` had only an `amount` field — no required
reason. Without a mandatory reason field, admins can credit wallets
without leaving a meaningful paper trail.  
**Fix:** Added mandatory `reason: string` field to DTO, service method,
and audit-log metadata.

### H-1 Referral code entropy too low

**Severity:** High  
**Status:** Fixed in this session  
**File:** `apps/api/src/referrals/referrals.service.ts:61`  
**Desc:** `randomBytes(3).toString('hex')` produces 6 hex characters =
24 bits ≈ 16.8 million codes. At the global rate limit of 60 req/min/IP,
an attacker can enumerate ~31.5M codes/year. With only a handful of
active codes in the system, a sustained brute-force over months becomes
feasible.  
**Fix:** Bumped to `randomBytes(6)` → 12 hex characters = 48 bits.
Existing 6-character codes in the database remain valid — lookup is by
exact string match.

### H-2 Voucher code entropy borderline

**Severity:** Medium  
**Status:** Fixed in this session  
**File:** `apps/api/src/voucher/voucher.service.ts:29`  
**Desc:** `randomBytes(4).toString('hex')` → 8 hex chars = 32 bits. At
60 req/min, ~0.7%/year brute-force probability. Borderline acceptable
but cheap to improve.  
**Fix:** Bumped to `randomBytes(8)` → 16 hex characters = 64 bits.

### M-1 Rate limit on voucher redeem

**Severity:** Medium  
**Status:** Fixed in this session  
**File:** `apps/api/src/voucher/voucher.controller.ts:53`  
**Desc:** The global 60 req/min/IP rate limit applies, but a dedicated
attacker can still make 3,600 guesses/hour against redeem codes. A
tighter per-endpoint limit raises the cost of brute-force enumeration.  
**Fix:** Added `@Throttle({ default: { ttl: seconds(60), limit: 10 } })`
on the `POST /vouchers/redeem` endpoint (10 req/min/user).

---

## Accepted design decisions

### D-1 Admin credit routes require AdminGuard but not a specific
permission node

**Risk:** Any admin can credit any non-admin wallet.  
**Tradeoff:** A `@Permissions('billing:credit')` decorator could enforce
finer-grained control. Adding it now would require defining and seeding
a new permission node and checking the caller's roles against it. This
adds complexity that may not match the actual admin-hierarchy model yet.
**Recommended action:** Revisit when admin roles & permissions are fully
seeded and the authorization model stabilizes.

### D-2 Error messages on voucher redeem are deliberately vague

`Invalid voucher code` is returned for all failure states (not found,
expired, fully redeemed, already-redeemed). This prevents attackers from
learning *why* a code failed, which would enable targeted abuse (e.g.,
learn which codes exist but are expired, vs. codes that don't exist).
**No change needed.**

---

## Out of scope (later phase)

- **Rate limiting per-user across all rate-limited endpoints:** A global
  per-user bucket (not just per-IP) would prevent a distributed
  brute-force. This requires a user-identifier-aware Throttler
  implementation and is a platform-level change.
- **Idempotency keys on billing mutation endpoints:** The Proxmox job
  system already uses idempotency keys. Extending them to
  voucher-redeem and admin-credit would prevent double-redemption even
  on network retry. Low priority given the atomic `updateMany` guard on
  voucher redeem.
- **Daily cap on total admin-credited amount per admin:** A hard ceiling
  (e.g., 100 000 credits/day/admin) would limit blast radius of a
  compromised admin account. Implementation requires a counter row or
  Redis incr. Medium priority for a future hardening pass.
