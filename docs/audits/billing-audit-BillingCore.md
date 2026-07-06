# FeatherPanel Audit: BillingCore

**Path:** `billing-systems/BillingCore/`
**Version:** 1.0.5 (from `conf.yml`)
**Language:** PHP 8.5 (backend), TypeScript/Vue 3 (frontend)
**Framework:** FeatherPanel v2 plugin (not standalone, not Laravel)

**Overview:** The foundational billing plugin. Manages the wallet/credits system, invoices, user billing info, and currency display. All other billing plugins depend on this. **No payment gateway code lives here** — gateway integration is in external plugins (`billingstripe`, `billingpaypal`, `billingrazorpay`).

---

## Files & Structure

14 PHP source files across:
- `BillingCore.php` — Entry point (implements `AppPlugin`, lifecycle hooks are empty)
- `Controllers/Admin/BillingCoreController.php` (1516 lines) — 22 admin endpoints
- `Controllers/User/BillingCoreController.php` (317 lines) — 6 user endpoints
- `Chat/Billing.php` (305 lines) — Credit data access with `SELECT FOR UPDATE`
- `Chat/Invoice.php` (268 lines) — Invoice CRUD
- `Chat/InvoiceItem.php` (222 lines) — Line item CRUD
- `Chat/UserBillingInfo.php` (143 lines) — Billing profile CRUD
- `Helpers/BillingHelper.php` (332 lines) — Invoice operations
- `Helpers/CreditsHelper.php` (58 lines) — Thin wrapper around Chat/Billing
- `Helpers/CurrencyHelper.php` (378 lines) — ISO 4217 currency definitions + formatting
- `Routes/billingcore.php` — ~30 routes
- `Migrations/` — 4 SQL files creating 4 tables

Frontend: Vue 3 SPA with 5 entry points (billing info, invoices, admin, admin invoices, user billing widget). ~50 shadcn-vue UI components.

---

## Backend — Functions & Endpoints

### Credit/Wallet Operations (Chat/Billing.php)

| Method | Lines | Purpose | Trigger | Inputs | Outputs | Business Rules |
|--------|-------|---------|---------|--------|---------|---------------|
| `getByUserId(userId)` | 30-48 | SELECT credits row | Any credit lookup | `int userId` | Row or null | No lock |
| `getOrCreateByUserId(userId)` | 50-79 | SELECT or INSERT row | First credit access | `int userId` | Row | Catches PDO 23000 on race |
| `getCredits(userId)` | 81-92 | Get balance | User dashboard | `int userId` | `int credits` | Auto-creates row with 0 |
| `setCredits(userId, credits)` | 94-130 | Absolute set | Admin set endpoint | `int userId, int credits` | `bool` | **Transaction + FOR UPDATE**. Rejects `credits < 0`. |
| `addCredits(userId, amount)` | 132-144 | Add positive amount | Admin add, referral awards | `int userId, int amount` | `bool` | `amount > 0`, wraps `adjustCredits` |
| `removeCredits(userId, amount)` | 146-158 | Remove positive amount | Plan charges, store purchases | `int userId, int amount` | `bool` | `amount > 0`, wraps `adjustCredits` |
| `adjustCredits(userId, delta)` | 160-184 | Atomic signed adjust | Internal | `int userId, int delta` | `bool` | **Transaction + FOR UPDATE**. Rejects `newCredits < 0`. |
| `lockRowForUser(pdo, userId)` | 296-303 | Row-level lock | Inside transactions | `\PDO, int userId` | Row or null | `SELECT ... FOR UPDATE` |

**Key business rules:**
- Credits are **always integers** (whole units, no decimals)
- Credits **cannot go below zero** (enforced atomically WITHIN the transaction, not check-then-act)
- Add/remove require strictly positive amounts
- User existence is verified before any operation

### Invoice Operations (Chat/Invoice.php)

| Method | Lines | Purpose | Business Rules |
|--------|-------|---------|---------------|
| `generateInvoiceNumber()` | 40-50 | `INV-YYYYMMDD-XXXXXXXX` | Uses `md5(uniqid(mt_rand(), true))` for random suffix |
| `create(data)` | 52-89 | Insert invoice | Defaults: `status=draft`, `subtotal=0.00`, `tax_rate=0.00`, `currency_code=EUR` |
| `update(id, data)` | 91-115 | Update fields | Returns false on empty payload |
| `delete(id)` | 117-137 | Delete invoice | Does NOT delete items explicitly (may rely on DB CASCADE) |
| `getByUserId(userId)` | 139-162 | Get user's invoices | Ordered by `created_at DESC` |
| `getById(id)` | 164-178 | Single invoice | |
| `getByInvoiceNumber(num)` | 180-193 | By invoice number | |

**Statuses:** `draft`, `pending`, `paid`, `overdue`, `cancelled`

### Invoice Item Operations (Chat/InvoiceItem.php)

- `total` auto-calculated as `quantity * unit_price` if not provided
- On update: `total` recalculated if `quantity` or `unit_price` changes
- Uses **float arithmetic** — SECURITY CONCERN: floating-point for money

### User Billing Info (Chat/UserBillingInfo.php)

- **Table:** `featherpanel_billing_user_info`
- Fields: `full_name`, `company_name`, `address_line1/2`, `city`, `state`, `postal_code`, `country_code`, `vat_id`, `phone`
- **First creation** requires non-null: `full_name`, `address_line1`, `city`, `postal_code`, `country_code`
- **Updates** preserve existing values of required fields if null (carry-forward pattern)
- `country_code` uppercased and trimmed

### Invoice Helper (Helpers/BillingHelper.php)

| Method | Purpose | Business Rules |
|--------|---------|---------------|
| `createInvoiceWithItems(userId, invData, itemsData)` | Create invoice + items atomically | Generates unique invoice number (retry loop), calculates `subtotal = SUM(qty * price)`, `tax = subtotal * (taxRate / 100)`, `total = subtotal + tax` |
| `recalculateInvoiceTotals(invoiceId, taxRate)` | Re-sum totals | Used when items change |
| `canCreateInvoice(userId)` | Check billing info exists | Returns true only if user has full billing profile |
| `userHasBillingInfo(userId)` | Check if billing info row exists | |
| `getUserBillingInfoOrDefault(userId)` | Get or default structure | No DB insert for default |
| `ensureUserBillingInfo(userId, defaults)` | Create if missing | |
| `getAdminBillingInfo()` / `saveAdminBillingInfo(data)` | Admin company billing profile | Whitelists 10 fields, JSON-encoded in PluginSettings |

### Currency Helper (Helpers/CurrencyHelper.php)

- **Hardcoded default currency:** EUR
- **Override:** PluginSetting `billingcore > default_currency`
- **Currency list:** ~170 built-in ISO 4217 currencies, merged with custom currencies from PluginSettings
- **`formatAmount(amount)`:** Returns `"€ X.XX (EUR)"` in currency mode, `"X.XX Credits"` in token mode
- **`credits_mode`:** Either `'currency'` or `'token'` (default `'currency'`)
- **No exchange rate / conversion logic** — formatting only. Credit-to-fiat conversion is in BillingPlans.

### Credits Helper (Helpers/CreditsHelper.php)

Thin 3-method wrapper: `getUserCredits()`, `addUserCredits()`, `removeUserCredits()`. No additional validation beyond what `Chat/Billing` performs.

---

## User-Facing Endpoints

All require authentication.

| Route | Method | Controller Method | Purpose |
|-------|--------|------------------|---------|
| `/api/user/billingcore/credits` | GET | `getCredits` | Balance, formatted balance, default currency |
| `/api/user/billingcore/billing` | GET | `getBilling` | Combined: billing row + credits + billing info |
| `/api/user/billingcore/billing-info` | GET | `getBillingInfo` | Billing profile |
| `/api/user/billingcore/billing-info` | PATCH | `updateBillingInfo` | Create or update billing profile (trims all fields) |
| `/api/user/billingcore/invoices` | GET | `listInvoices` | Paginated list with status filter (max 100 limit) |
| `/api/user/billingcore/invoices/{id}` | GET | `getInvoice` | Invoice with items + customer and admin billing info |

**Invoice access control:** Users can only see their own invoices (returns 404 for others).

---

## Admin Endpoints

All require `ADMIN_USERS_VIEW` or `ADMIN_USERS_EDIT` permission. All state-changing actions log via `Activity::createActivity()`.

| Route | Method | Permission | Purpose |
|-------|--------|------------|---------|
| `/api/admin/billingcore/users` | GET | VIEW | Paginated users with credits, search |
| `/api/admin/billingcore/users/{id}/credits` | GET | VIEW | Single user credits |
| `.../credits/add` | POST | EDIT | Add credits (logs `billingcore_add_credits`) |
| `.../credits/remove` | POST | EDIT | Remove credits (logs, **check-then-act race condition**) |
| `.../credits/set` | POST | EDIT | Set absolute balance (logs) |
| `.../users/search` | GET | VIEW | Search by username/email/UUID |
| `/api/admin/billingcore/currency/settings` | GET/PATCH | VIEW/EDIT | Default currency (validates ISO code) |
| `/api/admin/billingcore/currency/list` | GET | VIEW | All available currencies |
| `/api/admin/billingcore/statistics` | GET | VIEW | Total/average/zero-count credit stats |
| `/api/admin/billingcore/billing-info` | GET/PATCH | VIEW/EDIT | Admin billing profile (10 whitelisted fields) |
| `/api/admin/billingcore/users/{id}/billing-info` | GET/PATCH | VIEW/EDIT | User billing profile |
| `/api/admin/billingcore/invoices` | GET | VIEW | All invoices with search/status filter |
| `/api/admin/billingcore/invoices` | POST | EDIT | Create invoice (requires user billing info) |
| `/api/admin/billingcore/invoices/{id}` | various | VIEW/EDIT | Get/update/delete invoice |
| `/api/admin/billingcore/invoices/{id}/items` | POST | EDIT | Add item (recalc totals) |
| `.../items/{itemId}` | PATCH/DELETE | EDIT | Update/delete item (recalc totals) |
| `/api/admin/billingcore/settings` | GET/PATCH | VIEW/EDIT | `credits_mode` + `tokens_per_currency` |

---

## Payment Gateways

**NONE.** BillingCore contains zero payment gateway code. Gateway integrations (`billingstripe`, `billingpaypal`, `billingrazorpay`) are external plugins not present in this repository. They are referenced only in BillingPlans' `PlanGatewayPaymentHelper`.

---

## Security Observations

| Finding | Severity | Details |
|---------|----------|---------|
| **No idempotency keys** | HIGH | No idempotency key column or check anywhere in BillingCore |
| **Float for money** | HIGH | Invoice totals and item prices use `float`/`DECIMAL`, not integers |
| **Check-then-act race in admin remove** | MEDIUM | `removeUserCredits` controller checks balance first, then deducts — not atomic |
| **No ORM** | LOW | Raw PDO with manual SQL — no type safety, no migrations from code |
| **Invoice delete doesn't cascade explicitly** | LOW | `Invoice::delete()` doesn't delete items — relies on DB CASCADE |
| **SELECT FOR UPDATE** | ✅ GOOD | Credit adjustment operations use proper row-level locking |
| **Activity audit logging** | ✅ GOOD | All admin state-changing operations log via `Activity::createActivity()` |
| **No webhook handlers in BillingCore** | ✅ N/A | Webhooks are in separate gateway plugins (not reviewed) |

---

## UI/UX

### User Pages
- **Billing Info** (`BillingInfo.vue`) — Edit billing name/address/VAT. Form with text inputs for each field. Country code input.
- **Invoices** (`Invoices.vue`) — Paginated table with status badges. Click to view detail with line items.

### Admin Pages
- **Admin** (`Admin.vue`) — User search + credit management. Add/remove/set credits per user. Aggregate statistics.
- **Admin Invoices** (`AdminInvoices.vue`) — All invoices table with search/filter. CRUD invoices and line items.

---

## Key Business Rules Summary

1. Credits are integer-only, non-negative, per-user
2. Wallet row is lazily created on first access (INSERT-if-missing pattern with PDO 23000 catch for race safety)
3. Atomic credit adjustment uses `SELECT ... FOR UPDATE` inside a transaction
4. Invoices have 5 statuses: `draft → pending → paid | overdue | cancelled`
5. Tax is flat percentage applied to subtotal (no compound/tiered tax)
6. Currency display only — no exchange rates in BillingCore
7. Billing info is mandatory before invoice creation
8. **No payment processing happens in BillingCore** — it's purely a wallet/invoice manager
