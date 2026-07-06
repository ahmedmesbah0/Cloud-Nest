# FeatherPanel Audit: BillingResources

**Path:** `billing-systems/BillingResources/`
**Version:** 1.0.5
**Language:** PHP 8.5 / TypeScript Vue 3
**Framework:** FeatherPanel v2 plugin

**Overview:** Per-user resource pool tracking for memory, CPU, disk, servers, databases, backups, and allocations. This plugin is the foundation for BillingResourcesStore and BillingResourcesNewServers, providing granular limit enforcement and usage accounting across the entire resource inventory.

## Files & Structure
~8 PHP source files, 1 migration, ~70 total files

## Backend

### Resource Model (Chat/UserResources.php)
- Schema: `featherpanel_billingresources_user_resources`
- Per-user row with columns: memory_limit, cpu_limit, disk_limit, server_limit, database_limit, backup_limit, allocation_limit
- Default resources from SettingsHelper if no row exists
- Lazy row creation on first write
- User existence checked before any operation

### Used vs Available vs Overflow (Helpers/ResourcesHelper.php)
- Used = sum of server limit columns for memory/cpu/disk
- Used = count of actual records for databases, backups, allocations
- Available = max(0, limit - used)
- Overflow detected when used exceeds limit (only when limit > 0, 0 = unlimited)
- `checkServerResourceOverflow()` validates single server against user limits

### Adding/Removing Resources
- `addUserResource()`: amount > 0, checks max limit, uses `adjustResource()` with positive delta
- `removeUserResource()`: amount > 0, uses `adjustResource()` with negative delta (rejects negative result)
- `setUserResource()`: rejects negatives, checks max limit, delta-based
- `batchUpdate()`: checks ALL values against max limits BEFORE any update

### Race Safety
- `adjustResource()` uses transaction + `SELECT FOR UPDATE`
- `updateByUserId()` also uses FOR UPDATE in transaction
- On duplicate key (23000) during INSERT-iff-missing: logs and re-fetches

### Admin Endpoints
| Route | Method | Purpose |
|---|---|---|
| `GET /api/admin/billingresources/users` | GET | Paginated user list with limits, search |
| `GET .../users/{id}/resources` | GET | Single user resources |
| `PATCH .../users/{id}/resources` | PATCH | Update user resources (validates non-negative, checks max limits) |
| `GET .../search` | GET | Search users |
| `GET .../statistics` | GET | Aggregate stats (sum, avg) |
| `GET .../settings` / `PATCH .../settings` | GET/PATCH | Default and max resource limits |

### User-Facing Endpoints
| Route | Method | Purpose |
|---|---|---|
| `GET /api/user/billingresources/resources` | GET | Limits + used + max limits (creates row on first access) |
| `GET .../resources/{type}` | GET | Single resource value |
| `GET .../servers` | GET | Servers with per-resource used/available/limits |
| `PATCH .../servers/{id}/resources` | PATCH | Update server resource consumption (validates availability, min values) |

## Key Business Rules
1. Resources are per-user, not per-server
2. Used = server-configured limits (not actual usage) for memory/cpu/disk
3. 0 = unlimited for any resource type
4. Defaults from settings; row created lazily
5. FOR UPDATE for concurrency on adjustments
6. All admin mutations audit-logged via Activity::createActivity
