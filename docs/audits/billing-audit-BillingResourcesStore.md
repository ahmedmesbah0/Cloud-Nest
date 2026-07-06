# FeatherPanel Audit: BillingResourcesStore

**Path:** `billing-systems/BillingResourcesStore/`
**Version:** 1.0.5
**Language:** PHP 8.5 / TypeScript Vue 3
**Framework:** FeatherPanel v2 plugin

**Overview:** Sells resource packages and individual resources via credits. Depends on BillingCore (credits) and BillingResources (pool allocation).

## Files & Structure
11 PHP source, 3 SQL migrations, ~131 total files

## Backend

### Discount System (SettingsHelper.php)
Three-tier discount using max():
1. Package-specific (date-gated, discount_enabled flag)
2. Global discount (single percentage)
3. Bulk discount (array of threshold => discount%, highest applicable wins)
Cap at max_discount (default 50%)

### Package Purchase Flow (User/StoreController.php)
Pre-checks → discount calc → credit check → credit deduction → resource allocation (rollback credits on failure) → purchase record → optional invoice

### Individual Resource Purchase (User/IndividualResourcesController.php)
Pre-checks → resource validation → amount validation (min/max) → price calc → unit conversion (GB→MB for memory/disk) → credit deduction → resource allocation (refund on failure) → invoice

### Resource Package Schema (Chat/ResourcePackage.php)
Fields: name, description, all 7 resource limits, price (float — SECURITY CONCERN), enabled, sort_order, discount fields

### Individual Resource Schema (Chat/IndividualResource.php)
Fields: type (memory/cpu/disk), unit, amount, price, min/max, discount fields

### Admin Endpoints
| Route | Method | Purpose |
|---|---|---|
| GET/POST /api/admin/billingresourcesstore/packages | | List/create packages |
| PUT/DELETE .../packages/{id} | | Update/delete package (delete cascades to purchases) |
| GET/PUT .../settings | | Store settings (enable, discounts, invoice toggles) |
| GET/POST/PUT/DELETE .../individual-resources | | Individual resource CRUD |

### User Endpoints
| Route | Method | Purpose |
|---|---|---|
| GET /api/user/billingresourcesstore/packages | | Enabled packages with discount |
| POST /api/user/billingresourcesstore/purchase | | Purchase package |
| GET /api/user/billingresourcesstore/purchases | | Purchase history |
| GET .../individual-resources | | Resource prices |
| POST .../individual-resources/purchase | | Buy individual resources |

## SECURITY CONCERNS
- Float prices in store (not integer minor units)
- minimum_purchase_for_discount setting exists but is NEVER READ
