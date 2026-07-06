# FeatherPanel Audit: BillingRedeem

**Path:** `billing-systems/BillingRedeem/`
**Version:** 1.0.5
**Language:** PHP 8.5 / TypeScript Vue 3
**Framework:** FeatherPanel v2 plugin

**Overview:** Coupon/gift-code redemption for credits, plan trials, or plan coupons. Depends on BillingCore.

## Files & Structure
7 PHP source (1615 lines), 2 SQL migrations, ~102 total files

## Backend

### Code Validation (Chat/RedeemCode.php)
- CRUD for `featherpanel_billingredeem_codes`
- Columns: code (unique), amount, uses, max_uses (default 1), expires_at
- `isValid()`: checks expires_at and max_uses

### Reward Types (from migration)
- `credits` — fixed amount added to wallet
- `billing_plan_trial` — free period on a specific plan (plan_id + free_period_days)
- `billing_plan_coupon` — discount on plan subscription (discount_percent, discount_credits, coupon_scope)

### Redemption Flow (User/BillingRedeemController.php)
1. Validate code exists, not expired, not maxed out
2. Check `hasUserUsedCode()` — one-use-per-user
3. Begin transaction with FOR UPDATE:
   - Insert usage record
   - Increment uses
   - If reward_type=credits: CreditsHelper::addUserCredits
   - If reward_type=trial/coupon: store for plan subscription use (conditional on billingplans being installed)
4. Commit

### Admin Endpoints
| Route | Method | Purpose |
|---|---|---|
| GET/PUT .../settings | | System enable/disable |
| GET/POST/PUT/DELETE .../codes[/{id}] | | Code CRUD |
| GET .../codes/{id}/usage | | Code usage history |
| GET .../plan-options | | Available plans for coupon linking |

### User Endpoints
| Route | Method | Purpose |
|---|---|---|
| POST /api/user/billingredeem/redeem | | Redeem a code |
| GET /api/user/billingredeem/history | | Redemption history |

## Key Business Rules
1. One use per user per code (unique constraint on code_id + user_id)
2. max_uses default is 1 (single-use by default)
3. 3 reward types: credits, plan trial, plan coupon
4. FOR UPDATE for concurrency on redemption
5. Conditional on billingplans (checked via class_exists(Plan::class))
6. No idempotency keys
