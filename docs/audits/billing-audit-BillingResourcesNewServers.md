# FeatherPanel Audit: BillingResourcesNewServers

**Path:** `billing-systems/BillingResourcesNewServers/`
**Version:** 1.0.5
**Language:** PHP 8.5 / TypeScript Vue 3
**Framework:** FeatherPanel v2 plugin

**Overview:** Self-service server creation from user resource pool. CRITICAL: Does NOT check credit balance at creation time — only checks resource pool limits.

## Files & Structure
14 PHP source (5020 lines), 3 SQL migrations, ~161 total files

## Backend

### Balance Check vs. Provisioning
**There is NO credit balance check.** The creation flow validates resource pool availability only. Users must have pre-purchased resource capacity via BillingResourcesStore.

### Server Creation Flow (User/ServerCreationController.php)
1. Validate resources via ServerCreationHelper
2. Auto-select random free allocation
3. Create server DB record
4. Claim allocation
5. Create spell variables
6. Call Wings API to provision

### Resource Validation (ServerCreationHelper.php)
Sequential gate: global enabled → user permission → required fields → node validation → node capacity → location → realm → spell → free allocations → min resource checks → user resource checks (all 7 types against available pool)

### Field Policies (SettingsHelper.php - 1020 lines)
- Resource fields: user/fixed/hidden modes (anti-tamper enforced before validation)
- Placement fields: user/fixed/hidden with auto-strategies (first, least_capacity)
- Node placement scoring: (serverPressure*10000) + (memoryUsage*1000) + (diskUsage*100) - (freeAllocs*0.1)
- Node capacity: memory_overallocate and disk_overallocate percentages

### Permission System
- Global mode: 'all' or 'specific' (with allowlist)
- Resource-level: 'open' (anyone) or 'restricted' (needs user/group permission)
- 3 DB tables: user_permissions, groups, group_permissions, resource_permissions

### User Endpoints
| Route | Method | Purpose |
|---|---|---|
| GET .../options | | Filtered locations/nodes/realms/spells/resources/field policies |
| GET .../spells/{id} | | Spell details |
| GET .../allocations | | Available allocations for node |
| POST .../servers | | Create server (no credit check) |

### Admin Endpoints
Full CRUD for: settings, user permissions, groups (with user membership), resource permissions (per-resource-type access control)

## Key Business Rules
1. No credit check at server creation — only resource pool check
2. Resource consumption is retroactive (BillingResources sums from server configs)
3. Anti-tamper: fixed/hidden field policies override user-submitted values before validation
4. Node scoring for auto-placement (least_capacity strategy)
5. Permission system has 3 modes: per-user, per-group, per-resource
