# FeatherPanel Audit: BillingReferrals

**Path:** `billing-systems/BillingReferrals/`
**Version:** 1.0.5
**Language:** PHP 8.5 (backend), TypeScript/Vue 3 (frontend), legacy vanilla JS
**Framework:** FeatherPanel v2 plugin

**Overview:** Referral system that rewards users with credits for inviting new users. Integrates with BillingCore for credit payouts, requires BillingPlans. Uses cookie-based tracking and immediate credit awards at registration time. Has both a legacy vanilla JS frontend (injects into registration form) and a modern Vue 3 SPA.

---

## Files & Structure

7 PHP source files (1936 lines), 1 SQL migration, ~135 total files. Notable: has a `Frontend/index.js` (594 lines) legacy vanilla JS entry alongside the Vue 3 `Frontend/App/` SPA.

| File | Lines | Purpose |
|------|-------|---------|
| `BillingReferrals.php` | 211 | Entry point — processes referral on auth registration + user creation events |
| `Controllers/User/BillingReferralsController.php` | 364 | User code management, stats, visit tracking |
| `Controllers/Admin/BillingReferralsController.php` | 341 | Admin settings, code CRUD, usage list, stats |
| `Chat/ReferralCode.php` | 352 | Code CRUD, validation (expiry, max uses) |
| `Chat/ReferralUsage.php` | 301 | Usage tracking, uniqueness checks |
| `Helpers/ReferralHelper.php` | 141 | Plugin settings management |
| `Routes/billingreferrals.php` | 226 | Route definitions (13 endpoints) |

---

## Backend — Functions & Endpoints

### Referral Processing (BillingReferrals.php)

**Event hooks** registered in `processEvents()`:
- `AuthEvent::onAuthRegisterSuccess()` — user self-registers
- `UserEvent::onUserCreated()` — admin creates user

**`processNewUserRegistration($userData)` - the core logic:**

| Step | Operation | Business Rule |
|------|-----------|---------------|
| 1 | Check `isEnabled()` | Skip if system disabled |
| 2 | Read `$_COOKIE['billingreferrals_code']` | Cookie name: `billingreferrals_code` |
| 3 | `ReferralCode::getByCode(code)` | Lookup in DB |
| 4 | `isValid(code)` | Check `expires_at` AND `uses < max_uses` |
| 5 | Self-referral check | `code.user_id === newUserId` → reject silently (log warning) |
| 6 | Already-referred check | `hasUserBeenReferred(newUserId)` → reject silently |
| 7 | **BEGIN TRANSACTION** | |
| 7a | `SELECT ... FOR UPDATE` on code row | Re-validate under lock |
| 7b | `ReferralUsage::recordUsage()` | Insert usage record |
| 7c | `ReferralCode::incrementUses()` | `UPDATE codes SET uses = uses + 1` |
| 7d | `CreditsHelper::addUserCredits(referrer, referrerCredits)` | Default 100 credits |
| 7e | `CreditsHelper::addUserCredits(referee, refereeCredits)` | Default 50 credits |
| 8 | **COMMIT** | |
| 9 | Clear cookie | Expire immediately on success |

### Cookie Mechanism

| Aspect | Detail |
|--------|--------|
| Cookie name | `billingreferrals_code` |
| Set via | `POST /api/billingreferrals/visit` (called from frontend when `?ref=` param detected) |
| Validation on set | Code checked for existence + validity before cookie set |
| Attributes | `secure=true, httponly=true, samesite=Lax, path=/` |
| Lifetime | Configurable via `cookie_lifetime_days` (default 30 days) |
| Read | `$_COOKIE['billingreferrals_code']` |
| Cleared | After successful referral (past expiry) |

### Code Validation (`Chat/ReferralCode.php`)

- `isValid(code)`: Returns true if `expires_at` not past AND (max_uses = 0 OR uses < max_uses)
- Code generation: 8-character alphanumeric (uppercase + digits)
- Custom codes: 4-20 chars, alphanumeric, uppercased. Only if `allow_custom_codes` = true
- Unique code constraint (DB UNIQUE index)
- Duplicate check on update: excludes own ID when checking uniqueness

### Settings (`Helpers/ReferralHelper.php`)

| Key | Default | Validation |
|-----|---------|------------|
| `is_enabled` | (not set = disabled) | '1' or 'true' |
| `referrer_credits` | 100 | >= 0 |
| `referee_credits` | 50 | >= 0 |
| `default_max_uses` | 0 (unlimited) | >= 0 |
| `cookie_lifetime_days` | 30 | >= 1 |
| `allow_custom_codes` | false | Boolean |

---

## User-Facing Endpoints

All require authentication except `visit` and `register-context`.

| Route | Method | Auth | Controller Method | Purpose |
|-------|--------|------|-------------------|---------|
| `POST /api/billingreferrals/visit` | POST | Public | `trackVisit()` | Track referral visit, set cookie if code valid |
| `GET /api/billingreferrals/register-context` | GET | Public | `getRegisterContext()` | Tells registration page if referrals enabled + cookie status |
| `GET /api/user/billingreferrals/my-code` | GET | Auth | `getMyCode()` | User's own referral code (auto-creates if none) |
| `PATCH /api/user/billingreferrals/my-code` | PATCH | Auth | `updateMyCode()` | Update code (custom code validation) |
| `GET /api/user/billingreferrals/my-referrals` | GET | Auth | `getMyReferrals()` | List of referred users with pagination |
| `GET /api/user/billingreferrals/stats` | GET | Auth | `getMyStats()` | Total referrals, total credits earned |

---

## Admin Endpoints

All require `ADMIN_USERS_VIEW` or `ADMIN_USERS_EDIT` permission.

| Route | Method | Permission | Purpose |
|-------|--------|------------|---------|
| `GET /api/admin/billingreferrals/settings` | GET | VIEW | Current settings |
| `PATCH /api/admin/billingreferrals/settings` | PATCH | EDIT | Update settings (validates all fields) |
| `GET /api/admin/billingreferrals/codes` | GET | VIEW | List all codes with pagination + search |
| `POST /api/admin/billingreferrals/codes` | POST | EDIT | Create admin code |
| `GET /api/admin/billingreferrals/codes/{id}` | GET | VIEW | Single code detail |
| `PATCH /api/admin/billingreferrals/codes/{id}` | PATCH | EDIT | Update code |
| `DELETE /api/admin/billingreferrals/codes/{id}` | DELETE | EDIT | Delete code (cascades to usage) |
| `GET /api/admin/billingreferrals/codes/{id}/usage` | GET | VIEW | Paginated usage (referred users with email/username) |
| `GET /api/admin/billingreferrals/stats` | GET | VIEW | Total codes, referrals, credits awarded |

---

## Frontend

Two frontend implementations:
1. **Legacy** (`Frontend/index.js`, 594 lines) — Vanilla JS that injects into the registration form. Shows referral code field and auto-fills from URL param.
2. **Vue 3 SPA** (`Frontend/App/`) — Modern Vue UI for user dashboard (referrals.vue, admin.vue). Pages: referral stats, code management, admin panel.

The `Frontend/Components/billingreferrals/referral-tracker.js` is a lightweight tracker script for embedding on the registration page.

---

## Security Observations

| Finding | Severity | Detail |
|---------|----------|--------|
| **SELECT FOR UPDATE pattern** | ✅ GOOD | Transaction wraps usage record + credit award atomically |
| **Self-referral prevention** | ✅ GOOD | Checked before transaction |
| **Already-referred check** | ✅ GOOD | Prevents duplicate referrals |
| **Cookie security attributes** | ✅ GOOD | secure + httponly + samesite=Lax |
| **No idempotency keys** | MEDIUM | Event-based registration could fire twice in theory (though unique constraint on usage prevents duplicate awards) |
| **No audit logging** | MEDIUM | Credit awards from referrals are NOT logged via Activity::createActivity |
| **Silent failure on self-referral** | LOW | Returns without error, logs warning only |
| **No minimum spend for referee** | LOW | Credits awarded immediately at registration, no requirement for referee to make a purchase |

---

## Key Business Rules Summary

1. Credits are awarded immediately at registration (both referrer and referee)
2. Award is transactional: usage record + code increment + both credit awards commit or none do
3. Self-referral is silently rejected (logged as warning)
4. Each user can only be referred once (unique constraint on referred_user_id)
5. Cookie lifetime defaults to 30 days, configurable
6. Codes have optional expiry and max uses (0 = unlimited)
7. Custom codes are optional (admin setting) with 4-20 char alphanumeric constraint
8. Default awards: 100 for referrer, 50 for referee (configurable)
9. The `visit` endpoint validates code existence before setting cookie (prevents garbage cookies)
10. The `register-context` public endpoint exists so the registration page can show referral UI without auth
