# FeatherPanel Audit: BillingPlans

**Path:** `billing-systems/BillingPlans/`
**Version:** 1.0.5 (from `conf.yml`)
**Language:** PHP 8.5 / TypeScript Vue 3
**Framework:** FeatherPanel v2 plugin

**Overview:** The subscription engine for FeatherPanel — manages plan definitions, subscriptions (state machine with grace → suspend → terminate lifecycle), credit-based billing, invoice generation, coupon discounts, upgrade/downgrade plan changes, server provisioning via Wings API, and gateway payment checkout integration. The largest and most complex billing plugin (~24 PHP source files, 17 SQL migrations, ~186 total files).

---

## Files & Structure

24 PHP source files across:
- `BillingPlans.php` — Entry point, event listeners (3 server events)
- `Controllers/User/` — 4 controllers (Categories, Plans, Subscriptions, PlanGateway)
- `Controllers/Admin/` — 5 controllers (Categories, Plans, Subscriptions, Coupons, Settings)
- `Chat/` — 5 data-access classes (Plan, Subscription, Category, GatewayCheckout)
- `Helpers/` — 3 helpers (InvoiceHelper, PlanGatewayPaymentHelper, SettingsHelper)
- `Services/` — 2 services (PlanSubscriptionActivationService, GatewaySubscriptionCancellationService)
- `Cron/` — 1 cron job (BillingPlansRenewal)
- `Routes/billingplans.php` — 26 routes (9 user, 17 admin)
- `Mail/` — 2 Mailable classes (SubscriptionSuspended, SubscriptionTerminated)
- `Commands/` — 1 CLI command
- `Migrations/` — 17 SQL files creating/modifying tables for plans, subscriptions, categories, gateway checkouts, coupons, stock control, access control, etc.

Frontend: Vue 3 SPA entries for admin and client. ~50 shadcn-vue UI components.

---

## Backend — Functions & Endpoints

### Plan Definitions (Chat/Plan.php)

| Aspect | Details |
|--------|---------|
| **Table** | `featherpanel_billingplans_plans` |
| **Pricing** | `price_credits` (integer), `tax_rate_percent` (0–1000, normalized), `extra_charge_percent` (same), `extra_charge_name` (custom label) |
| **Resource limits** | `memory`, `cpu`, `disk`, `swap`, `io`, `backup_limit`, `database_limit`, `allocation_limit` |
| **Slider add-ons** | `slider_config` (JSON — per-resource key with `{enabled, base, max, step, cost_per_step, rounding}`) — allows users to purchase additional resources above base |
| **Stock control** | `max_subscriptions` (null = unlimited), `getActiveSubscriptionCount()` counts `active`/`suspended`/`pending` subs |
| **Up/downgrade** | `allowed_upgrade_plan_ids`, `allowed_downgrade_plan_ids` (JSON int arrays) |
| **Billing periods** | `billing_period_days`; `getBillingPeriodLabel()` maps common values (1→Daily, 7→Weekly, 30→Monthly, 365→Annually, else "Every X Days") |
| **Server template** | `realms_id`, `spell_id`, `node_ids` (JSON multi-node), `user_can_choose_realm/spell`, `allowed_realms/spells`, `startup_override`, `image_override`, `server_config` |
| **Card image** | `card_background_image` — URL for plan card display |

**`calculateChargeBreakdown(array $plan)` formula:**
1. Start with `base_credits = max(0, price_credits)`
2. Add slider add-on costs: for each enabled slider where `customResources[key] > base`, compute `steps = (selected - base) / step` (with rounding: up/down/nearest), `additionalCost = steps * cost_per_step`, add to `base_credits`
3. `tax_credits = round(base * taxRate / 100, PHP_ROUND_HALF_UP)`
4. `extra_charge_credits = round(base * extraChargePercent / 100, PHP_ROUND_HALF_UP)`
5. `total_credits = max(0, base + tax + extra)`

All amounts are integers (credits). Note: tax is applied to `base_credits` **after** slider add-ons are included, not before.

### Subscription State Machine (Chat/Subscription.php)

**Table:** `featherpanel_billingplans_subscriptions`

**5 statuses:**

| Status | Description |
|--------|-------------|
| `pending` | Initial state before activation |
| `active` | Subscription is current; renewal is due when `next_renewal_at <= NOW()` |
| `suspended` | Payment failed or admin action; server may be suspended |
| `cancelled` | User/admin cancelled; if at period end, server runs until `next_renewal_at` then moves to `suspended` |
| `expired` | Terminal state (not actively set by cron — the lifecycle goes suspended→cancelled) |

**State transitions:**

```
pending ──(subscribe)──→ active ──(cancel at period end)──→ cancelled ──(end of term)──→ suspended
active  ──(renewal fails, no grace)──→ suspended
active  ──(renewal fails, grace started)──→ active (grace) ──(grace expires)──→ suspended
suspended ──(renewal succeeds)──→ active
suspended ──(termination_days elapsed)──→ cancelled (server deleted)
active  ──(server deleted in panel)──→ cancelled
active  ──(server suspended in panel & server_suspend_sync=1)──→ suspended
suspended ──(server unsuspended in panel & server_suspend_sync=1)──→ active
```

**Key query methods:**
- `getDueForRenewal()` — `status='active' AND next_renewal_at <= NOW()`
- `getDueCancellation()` — cancelled subs past their `next_renewal_at` with a server still attached
- `getByStatus(status)` — all subs with given status (used for terminations)

**Admin refund tracking:**
- `recordAdminRefund(id, amount)` — increments `admin_credits_refunded_total`, sets `admin_refunded_at = NOW()`
- `getAdminRefundAggregateStats()` — SUM of refunded credits, count of subs with refunds

### Invoice Helper (Helpers/InvoiceHelper.php)

Thin wrapper around BillingCore's `BillingHelper::createInvoiceWithItems()`.

- `createPurchaseInvoice()` — Called on initial subscribe. Creates a "paid" invoice with line items for base, tax, and extra charge. Notes field: `"Plan purchase for subscription #X. Amount is denominated in credits, not real currency."`
- `createRenewalInvoice()` — Called on successful renewal in cron. Same pattern with renewal-specific notes.
- Both skip if `SettingsHelper::getGenerateInvoices()` is false.
- Invoice amounts use **float** cast from integers — SECURITY CONCERN: floats for money in the BillingCore invoice layer.

### Gateway Integration (Helpers/PlanGatewayPaymentHelper.php + Services/)

**3 supported gateways:** Stripe, PayPal, Razorpay (via external plugins `billingstripe`, `billingpaypal`, `billingrazorpay`)

**Credit-to-currency conversion:**
- `planChargeToMoney(planId, chargeCredits)` → `amount_cents = max(50, round(chargeCredits / creditsPerUnit * 100))`
- `getCreditsPerCurrencyUnit()` — checks gateway plugin setting `credits_per_currency`, then falls back to `CurrencyHelper.getCreditsMode()`:
  - `'currency'` mode → 100 (1 credit = 1 cent)
  - `'token'` mode → `tokens_per_currency` from BillingCore settings (min 1)
- **Minimum 50 cents** enforced for gateway charges

**Billing period to interval mapping:**
- `billingPeriodToInterval(days)` → `['interval' => 'day'|'week'|'month'|'year', 'interval_count' => int]`
  - ≥365 → year (rounded)
  - 28–31 → month, count=1
  - 7 → week, count=1
  - <28 and divisible by 7 → week, count=days/7
  - else → day, count=days

**Gateway checkout pipeline:**
1. User calls `POST /api/user/billingplans/plans/{id}/checkout` (PlanGatewayController::startRecurringCheckout)
2. GatewayCheckout row created with `status=pending`
3. Gateway-specific handler class called (`StripeRecurringService::createPlanCheckout`, etc.)
4. On webhook: `PlanSubscriptionActivationService::completeCheckout()` called
5. `completeCheckout` checks `status !== 'pending'` as **idempotency guard** (state-based, not idempotency-key-based)
6. Synthetically calls `PlansController::subscribe()` with `_billingplans_skip_initial_charge=true`
7. Updates subscription with gateway metadata `(payment_gateway, gateway_subscription_id, gateway_customer_id, auto_renew_via_gateway=1)`
8. Marks checkout as `completed`

`recordGatewayRenewal()` — extends `next_renewal_at` for gateway-renewed subscriptions (bypassed credit deduction since gateway handles payment).

**Cancellation:** `GatewaySubscriptionCancellationService::cancelAtGateway()` — calls `cancelSubscription` on the matching gateway service class if `auto_renew_via_gateway` is set.

### Settings (Helpers/SettingsHelper.php)

| Setting | Key | Type | Default | Description |
|---------|-----|------|---------|-------------|
| Suspend servers | `suspend_servers` | bool | `true` | Suspend linked server on Wings when renewal fails |
| Unsuspend on renewal | `unsuspend_on_renewal` | bool | `true` | Unsuspend server on successful renewal |
| Grace period | `grace_period_days` | int | `0` | Days before suspension after failed renewal (0 = immediate) |
| Termination days | `termination_days` | int | `0` | Days after suspension before auto-cancel + server delete (0 = never) |
| Send suspension email | `send_suspension_email` | bool | `true` | Email user on suspension |
| Send termination email | `send_termination_email` | bool | `true` | Email user on auto-termination |
| Allow user cancellation | `allow_user_cancellation` | bool | `true` | Users can cancel own subscriptions |
| Cancel at period end | `cancel_at_period_end` | bool | `true` | Keep server running until billing period ends when cancelled |
| Generate invoices | `generate_invoices` | bool | `true` | Create BillingCore invoice on purchase/renewal |

### Renewal/Termination Cron (Cron/BillingPlansRenewal.php)

Runs every 1 minute (`'1M'` cron interval). Three phases:

**Phase 1 — `processRenewals()`:**
1. Fetches all subs via `Subscription::getDueForRenewal()` (`status='active' AND next_renewal_at <= NOW()`)
2. For each sub:
   - Calculates charge breakdown via `Plan::calculateChargeBreakdown()`
   - Applies renewal discount: `percentDiscount = round(price * renewal_discount_percent / 100)`, `totalDiscount = min(price, percentDiscount + renewal_discount_credits)`, `discountedCredits = max(0, price - totalDiscount)`
   - Checks user's credit balance
   - **3 paths if insufficient balance:**
     - **In grace period** (grace_started_at set, still within grace_period_days) → stays active, returned as 'grace'
     - **Grace not yet started** (grace_period_days > 0, no grace_started_at) → sets grace_started_at, returned as 'grace'
     - **No grace or grace expired** → status→'suspended', suspended_at=NOW(), server_suspend_sync=0, optionally suspends server on Wings, optionally sends suspension email
   - **If sufficient balance:**
     - Deducts credits via `CreditsHelper::removeUserCredits()`
     - Sets next_renewal_at = NOW() + periodDays
     - Resets status='active', clears suspended_at/grace_started_at
     - If was suspended and `unsuspend_on_renewal` is true, unsuspends server (DB-only, `suspended=0`)
     - Creates renewal invoice

**Phase 2 — `processTerminations()`:**
1. Skips if `termination_days <= 0`
2. Fetches all suspended subs via `Subscription::getByStatus('suspended')`
3. For each sub where `time() >= (suspended_at + termination_days)`:
   - Status→'cancelled', cancelled_at=NOW(), server_uuid=null
   - Calls `deleteServer()` — unclaims allocations, `Server::hardDeleteServer()`, Wings API delete, sends termination email

**Phase 3 — `processCancellations()`:**
1. Fetches cancelled subs past their `next_renewal_at` via `Subscription::getDueCancellation()`
2. For each:
   - Status→'suspended', suspended_at=NOW(), server_suspend_sync=0
   - Optionally suspends server on Wings; optionally sends suspension email

**Server actions:**
- `suspendServer(uuid)` — DB-only: `Server::updateServerById(..., ['suspended' => 1])`. Does NOT call Wings API.
- `deleteServer(uuid)` — Unclaims allocations, `Server::hardDeleteServer()`, calls Wings API `deleteServer()`. Wings failure logged but DB deletion proceeds.
- `unsuspendServer(uuid)` — DB-only: `['suspended' => 0]`. No Wings call.

### Subscription Activation (Services/PlanSubscriptionActivationService.php)

- `completeCheckout(checkoutId, gatewaySubscriptionId, gatewayCustomerId)`:
  - Idempotency: if `status === 'completed'` and has `subscription_id`, returns existing result immediately
  - Rejects if not `pending`
  - Destroys checkout row on fatal errors (status→'failed')
  - Creates subscription via `PlansController::subscribe()` with `_billingplans_skip_initial_charge=true`
  - Attaches gateway metadata to subscription
  - Creates purchase invoice
  - Marks checkout→'completed'

- `recordGatewayRenewal(gateway, gatewaySubscriptionId)`:
  - Finds subscription by `payment_gateway + gateway_subscription_id`
  - Extends `next_renewal_at` by `billing_period_days`
  - Clears grace/suspension timestamps

### Coupon Integration (Controllers/User/PlansController.php)

Coupons use BillingRedeem plugin's `RedeemCode` model with reward type `billing_plan_coupon`.

**Validation (`resolveCouponForSubscription`):**
1. Checks RedeemCode exists and is valid
2. Checks `reward_type === 'billing_plan_coupon'`
3. If code has `plan_id`, verifies it matches the target plan
4. Checks user hasn't already used this code (via `RedeemUsage::hasUserUsedCode`)
5. Validates discount configuration (percent and/or fixed credits must be > 0)

**Discount calculation:**
- `percentDiscountCredits = round(total * discountPercent / 100)`
- `totalDiscount = min(total, percentDiscountCredits + discountCredits)`
- `initial_charge_credits = max(0, total - totalDiscount)`
- `renewal_discount_percent/credits` stored on subscription for cron usage

**Scope:** `initial` (first purchase only), `renewal` (recurring only), `both` (applies to both)

### Plan Change (Upgrade/Downgrade) — Controllers/User/SubscriptionsController.php

- Eligibility: only active or suspended subscriptions
- Permitted transitions: from `allowed_upgrade_plan_ids` / `allowed_downgrade_plan_ids` on the old plan
- If no explicit rules defined (`allowed_upgrade_plan_ids` + `allowed_downgrade_plan_ids` both empty), all transitions are allowed
- **Delta calculation:** full difference between old and new plan's `total_credits` (no proration)
  - Upgrade (delta > 0): checks user balance, deducts delta
  - Downgrade (delta < 0): refunds absolute delta
  - Same price (delta = 0): allowed only if target is in the union of upgrade+downgrade lists
- **Billing period reset:** `next_renewal_at` is reset to NOW() + new plan's `billing_period_days`
- Audit log: `billingplans_change_subscription_plan`
- **Best-effort rollback:** if `Subscription::update()` fails after credit movement, credits are moved back (separate queries, not wrapped in a transaction)

### Server Provisioning (Controllers/User/PlansController.php)

Provisioning happens during `subscribe()` if the plan has both a realm (egg) and a spell (nest).

**Process:**
1. Validates the plan expects a server (`spell_id OR user_can_choose_spell` AND `realms_id OR user_can_choose_realm`)
2. Resolves realm and spell (user-chosen or plan-default)
3. Validates spell belongs to realm
4. **Node selection:** iterates `plan.node_ids`; if empty, uses all nodes from `Node::getAllNodes()`
5. For each node, checks `Node.getById()` exists AND node is enabled AND has at least one free allocation
6. Picks first passing node (no resource capacity check — allocation existence is the only constraint)
7. Gets free allocations on that node (up to 100), shuffles, picks first
8. Resolves startup command and Docker image (plan override → spell default)
9. Creates server record in DB via `Server::createServer()`
10. Assigns allocation via `Allocation::assignToServer()`
11. Creates server variables from spell defaults (fails if required variable has no default)
12. Calls Wings API `createServer()` (with `start_on_completion=true`)
13. **Error handling:** on any failure after credit deduction, credits are refunded via best-effort `CreditsHelper::addUserCredits()`. Provisioned server is hard-deleted on mid-flow errors.

**Key observation:** Node selection does NOT check node resource usage counters (memory/disk/cpu) — it only verifies the node exists, is enabled, and has at least one free allocation. The comment in the code acknowledges this intentionally mirrors admin manual server creation.

### Event Listeners (BillingPlans.php)

Three server events via `App\Plugins\PluginEvents`:

| Event | Action |
|-------|--------|
| `ServerEvent::onServerSuspended()` | For each subscription linked to the server with `status='active'` → status→'suspended', `server_suspend_sync=1` (flags that this was panel-driven, not billing-driven) |
| `ServerEvent::onServerUnsuspended()` | For each subscription with `status='suspended' AND server_suspend_sync=1` → reactivate to `active`, clear suspended_at, reset `server_suspend_sync=0`. Billing-driven suspensions (server_suspend_sync=0) are NOT unsuspended by this event. |
| `ServerEvent::onServerDeleted()` | For each subscription linked to the deleted server: if status is `cancelled`/`expired`, just clears `server_uuid`; otherwise cancels the subscription immediately. Logs activity as `billingplans_subscriptions_closed_server_deleted`. |

### User Endpoints

| Route | Method | Controller | Purpose |
|---|---|---|---|
| `/api/user/billingplans/categories` | GET | User\CategoriesController::list | List active categories with plan counts (filters to categories with >0 plans) |
| `/api/user/billingplans/plans` | GET | User\PlansController::list | List active plans with breakdown, can-afford flag, realm/spell options, location names |
| `/api/user/billingplans/plans/{planId}` | GET | User\PlansController::get | Single plan detail with charge breakdown |
| `/api/user/billingplans/plans/{planId}/subscribe` | POST | User\PlansController::subscribe | Purchase plan via credits (credit check, realm/spell validation, server provisioning, subscription creation, invoice) |
| `/api/user/billingplans/plans/{planId}/validate-coupon` | POST | User\PlansController::validateCoupon | Validate a coupon code against a plan |
| `/api/user/billingplans/subscriptions` | GET | User\SubscriptionsController::list | User's subscriptions with charge breakdown, upgrade/downgrade IDs, pending cancellation flag |
| `/api/user/billingplans/subscriptions/{id}` | GET | User\SubscriptionsController::get | Single subscription (ownership check) |
| `/api/user/billingplans/subscriptions/{id}` | DELETE | User\SubscriptionsController::cancel | Cancel subscription (at period end or immediately), optionally suspend server |
| `/api/user/billingplans/subscriptions/{id}/change-plan` | POST | User\SubscriptionsController::changePlan | Upgrade/downgrade plan (full delta, no proration) |
| `/api/user/billingplans/gateways` | GET | User\PlanGatewayController::listGateways | List enabled payment gateways |
| `/api/user/billingplans/plans/{id}/checkout` | POST | User\PlanGatewayController::startRecurringCheckout | Start gateway checkout (creates GatewayCheckout row, calls gateway handler) |

### Admin Endpoints

| Route | Method | Permission | Purpose |
|---|---|---|---|
| `/api/admin/billingplans/categories` | GET | VIEW | List all categories (paginated, searchable) |
| `/api/admin/billingplans/categories` | POST | EDIT | Create category |
| `/api/admin/billingplans/categories/{id}` | GET | VIEW | Get category |
| `/api/admin/billingplans/categories/{id}` | PATCH/PUT | EDIT | Update category |
| `/api/admin/billingplans/categories/{id}` | DELETE | EDIT | Delete category (nullifies category_id on plans) |
| `/api/admin/billingplans/plans` | GET | VIEW | List all plans (paginated, searchable, with charge breakdown) |
| `/api/admin/billingplans/plans` | POST | EDIT | Create plan |
| `/api/admin/billingplans/plans/{id}` | GET | VIEW | Get plan |
| `/api/admin/billingplans/plans/{id}` | PATCH/PUT | EDIT | Update plan |
| `/api/admin/billingplans/plans/{id}` | DELETE | EDIT | Delete plan |
| `/api/admin/billingplans/options` | GET | VIEW | Get nodes/realms/spells/plans/categories for form dropdowns |
| `/api/admin/billingplans/images` | GET | VIEW | List card background images |
| `/api/admin/billingplans/images/upload` | POST | EDIT | Upload card background image (max 10MB, JPG/PNG/GIF/WebP) |
| `/api/admin/billingplans/subscriptions` | GET | VIEW | List all subscriptions (paginated, status filter, search by user/plan) |
| `/api/admin/billingplans/subscriptions/{id}` | GET | VIEW | Get subscription with enriched server info |
| `/api/admin/billingplans/subscriptions/{id}` | PATCH/PUT | EDIT | Update subscription (status, server_uuid, next_renewal_at; mirrors server state) |
| `/api/admin/billingplans/subscriptions/{id}` | DELETE | EDIT | Cancel subscription (admin) |
| `/api/admin/billingplans/subscriptions/{id}/refund` | POST | EDIT | Refund credits to subscriber (defaults to plan price_credits, tracks running total) |
| `/api/admin/billingplans/users/{userId}/subscriptions` | GET | VIEW | Get all subscriptions for a user |
| `/api/admin/billingplans/stats` | GET | VIEW | Subscription counts by status, plan counts, admin refund aggregates |
| `/api/admin/billingplans/coupons` | GET | VIEW | List coupons (requires billingredeem plugin) |
| `/api/admin/billingplans/coupons` | POST | EDIT | Create coupon |
| `/api/admin/billingplans/coupons/{id}` | GET | VIEW | Get coupon |
| `/api/admin/billingplans/coupons/{id}` | PATCH/PUT | EDIT | Update coupon |
| `/api/admin/billingplans/coupons/{id}` | DELETE | EDIT | Delete coupon |
| `/api/admin/billingplans/settings` | GET | VIEW | Get plugin settings |
| `/api/admin/billingplans/settings` | PATCH/PUT | EDIT | Update plugin settings |

---

## SECURITY CONCERNS

| Finding | Severity | Details |
|---------|----------|---------|
| **No idempotency keys** | HIGH | No idempotency key column exists on subscriptions or checkouts. The subscribe endpoint has no guard against double-execution. Partial mitigation: `completeCheckout` checks `status !== 'pending'` before proceeding. |
| **Check-then-act credit deduction (subscribe)** | HIGH | `PlansController::subscribe()` checks balance via `CreditsHelper::getUserCredits()`, then deducts via `CreditsHelper::removeUserCredits()` — two separate calls. No DB transaction wrapping the check+deduct. Race condition: two simultaneous subscribe requests from the same user could overspend. |
| **Check-then-act credit deduction (upgrade)** | HIGH | Same pattern in `changePlan()` — checks balance, then deducts, no transaction. |
| **Check-then-act credit deduction (cron renewal)** | HIGH | `renewSubscription()` checks balance, THEN deducts. No transaction. In the cron context this is single-threaded, but still not atomic. |
| **Check-then-act in admin refund** | MEDIUM | No `SELECT FOR UPDATE` or transaction around `CreditsHelper::addUserCredits()` + `recordAdminRefund()`. |
| **No transaction wrapping provision → subscription create** | MEDIUM | If subscription create fails after server provision, the server is cleaned up via a best-effort `cleanupProvisionedServer()` call — not atomic. |
| **Float for invoice amounts** | MEDIUM | `InvoiceHelper` casts integer credits to `(float)` for BillingCore invoice items — inherits BillingCore's float-money problem. |
| **Best-effort rollback on plan change failure** | MEDIUM | If `Subscription::update()` fails after credit movement, rollback uses separate unguarded credit calls — could leave inconsistent state if rollback also fails. |
| **No resource capacity check in node selection** | LOW | Node provisioning only checks allocation availability, not memory/disk/cpu headroom. Server creation may oversubscribe a node. |
| **Admin subscription update can mirror server state without audit** | LOW | When admin changes subscription status, server `suspended` flag is updated directly — no separate audit event for the server state change. |
| **Activity logging present** | ✅ GOOD | All state-changing admin actions log via `Activity::createActivity()` with structured context. |
| **Server delete on termination: DB deletion regardless of Wings failure** | ✅ GOOD (design choice) | `deleteServer()` always deletes the DB record even if Wings API call fails — ensures no orphaned subscriptions. |

---

## Key Business Rules Summary

1. **Credits are always integers** — plan prices, tax, extra charges, slider costs, and discounts are all whole credits.
2. **Tax is calculated on base credits including slider add-ons** — not on base price alone. Tax rate is capped at 1000%.
3. **Renewal charges first check balance, then deduct** — no atomic transaction around the check+deduct.
4. **Grace period gives users extra days before suspension** — configurable (default 0 = immediate suspend). Grace is tracked per-subscription via `grace_started_at`.
5. **Termination permanently deletes the server** — after `termination_days` suspended (default 0 = never auto-terminate). DB record and Wings server are both deleted.
6. **Cancelled subscriptions keep the server running until period end** — when `cancel_at_period_end=true` (default). End-of-term cancelled subs move to `suspended` and enter the termination lifecycle.
7. **No proration on upgrade/downgrade** — full delta is charged or refunded, and the billing period resets completely.
8. **Server provisioning selects the first eligible node** — no resource capacity check, only checks node enabled + has a free allocation.
9. **Gateway minimum charge is 50 cents** — enforced in `planChargeToMoney()`.
10. **Coupons have three scopes** — `initial` (first purchase), `renewal` (recurring), `both`. Renewal discounts are stored on the subscription and applied during cron renewal.
11. **Plan stock control is checked at subscribe time** — `max_subscriptions` limits are validated before allowing a new subscription.
12. **Panel-driven server suspend/unsuspend syncs subscription state** — via `server_suspend_sync` flag. Only panel-initiated suspensions are auto-reactivated on unsuspend.
13. **Server deletion in the panel cancels linked subscriptions** — active subscriptions are cancelled, stale links on already-cancelled/expired subs are cleared.
14. **Admin refunds increment a running total** — `admin_credits_refunded_total` tracks cumulative refunds per subscription for audit purposes.
15. **Invoice generation is optional** — controlled by `generate_invoices` setting. Invoices are denominated in credits, not real currency, with an explicit note to that effect.
