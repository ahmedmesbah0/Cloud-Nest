# CloudNest Architecture Audit

**Date:** 2026-07-04
**Scope:** All modules in `apps/api/src/` — structural compliance against AGENTS.md rules and the referenced ARCHITECTURE_AND_SECURITY_RULES.md.

---

## Foundational Issue: ARCHITECTURE_AND_SECURITY_RULES.md Does Not Exist

- **File:** `docs/ARCHITECTURE_AND_SECURITY_RULES.md`
- **What's wrong:** AGENTS.md references this file as the governance document for all code structure, but it was never created.
- **Severity:** should-fix
- **Remediation:** Write the file with the four-layer structure mandate, module boundary rules, section-7 template, and all security rules that AGENTS.md summarizes.

All findings below are assessed against AGENTS.md non-negotiable rules, since the referenced architecture document is absent.

---

## 1. Four-Layer Structure (controller → service → repository → Prisma)

**Rule:** AGENTS.md rule 11 mandates this structure. Rule 10 says controllers must be thin.

### Finding 1.1 — Zero repository files exist

| Module | Repository Exists? | Service Accesses Prisma Directly? |
|--------|-------------------|-----------------------------------|
| admin | No | Yes — `admin.service.ts:3` imports `PrismaService` |
| api-keys | No | Yes — `api-keys.service.ts:2` imports `PrismaService` |
| auth | No | Yes — `auth.service.ts:9` imports `PrismaService` |
| billing | No | Yes — `billing.service.ts:2` imports `PrismaService` |
| bullmq | No | Yes — `proxmox-job.service.ts:4` / `proxmox-job.consumer.ts:4` import `PrismaService` |
| ip-pool | No | Yes — `ip-pool.service.ts:2` imports `PrismaService` |
| mail | No | Yes — `mail.service.ts:2` imports `PrismaService` |
| metrics | No | Yes — `metrics.service.ts:2` imports `PrismaService` |
| notifications | No | Yes — `notifications.service.ts:2` imports `PrismaService` |
| proxmox | No | Yes — `proxmox.service.ts:5` imports `PrismaService` |
| resource-pool | No | Yes — `resource-pool.service.ts:2` imports `PrismaService` |
| ssh-keys | No | Yes — `ssh-keys.service.ts:2` imports `PrismaService` |
| support | No | Yes — `support.service.ts:2` imports `PrismaService` |
| vms | No | Yes — `vm.service.ts:2` imports `PrismaService` |
| voucher | No | Yes — `voucher.service.ts:2` imports `PrismaService` |
| wallet | No | Yes — `wallet.service.ts:2` imports `PrismaService` |

Additionally:
- **No `BaseRepository` class** exists anywhere. Every service does `this.prisma.<model>.findMany/update/create/delete` directly.
- **Guards access Prisma directly:** `admin.guard.ts:2`, `jwt.strategy.ts:5` import `PrismaService`.
- **Infrastructure services access Prisma directly:** `proxmox.service.ts:5`, `mail.service.ts:2`.

**Severity:** blocking (entire codebase)
**Remediation:** Create `BaseRepository` + per-module repositories; refactor all services; refactor guards to query through services or use a lightweight lookup method.

### Finding 1.2 — Business logic in controllers

| File | Line | What's wrong |
|------|------|-------------|
| `apps/api/src/vms/vm.controller.ts` | 261 | Iterates DTO keys dynamically with `(dto as any)[key]` to map to the service call — type-unsafe and contains logic that should be in a service or DTO mapper. |
| `apps/web/src/app/dashboard/vms/[id]/page.tsx` | 1102-1108 | Hardware config array with labels mixed into component — UI config, but heavy for a view layer file. Frontend is less constrained by the four-layer rule, but the file is 1100+ lines suggesting component extraction is warranted. |

**Severity:** minor
**Remediation:** Extract DTO mapping to a helper/mapper; split large frontend component.

---

## 2. Cross-Module Repository/Prisma Imports

**Rule:** AGENTS.md rule 11 — "Never import another module's repository or Prisma models directly — go through that module's service or a domain event."

Since **no repositories exist**, every service reads/writes every model via `this.prisma.<model>`. This means every module can (and does) access every other module's data without going through that module's service.

### Finding 2.1 — All services access cross-module Prisma models directly

High-profile examples:

| Service | Cross-Module Models Accessed | Should Go Through |
|---------|------------------------------|-------------------|
| `admin.service.ts` | `vm`, `wallet`, `user`, `node`, `transaction`, `setting`, `auditLog`, `vmTemplate`, `role`, `userRole`, `permission`, `rolePermission`, `supportTicket`, `supportTicketMessage`, `notification` | admin service is a coordination layer, but still bypasses 12+ modules |
| `billing.service.ts` | `vm`, `node`, `invoice`, `transaction`, `wallet` | vms, invoice, wallet |
| `vm.service.ts` | `vmTemplate`, `node`, `resourcePool`, `resourceAllocation`, `backup`, `snapshot`, `ipAddress`, `auditLog` | resource-pool, ip-pool, audit (would-be module) |
| `proxmox-job.consumer.ts` | `vm`, `resourceAllocation`, `backup`, `snapshot`, `idempotencyKey`, `auditLog`, `notification` | vms, resource-pool, notifications |

**Severity:** blocking
**Remediation:** Per-module repositories + service interfaces. The admin service inherently coordinates across modules, so it is the hardest case — consider a domain-event pattern or dedicated admin repository that is the single cross-cutting layer.

### Finding 2.2 — BullmqModule imports consumers from other modules

| File | Line | Import |
|------|------|--------|
| `bullmq/bullmq.module.ts` | 10 | `import { ReportJobConsumer } from '../billing/report-job.consumer'` |
| `bullmq/bullmq.module.ts` | 11 | `import { MetricsJobConsumer } from '../metrics/metrics-job.consumer'` |

**Severity:** minor
**Remediation:** Register consumers in their own modules and have BullmqModule import them via `forRootAsync` + dynamic provider registration instead of direct import.

### Finding 2.3 — All controllers import guards/decorators from auth module

Every controller imports `JwtAuthGuard`, `CurrentUser`, and/or `AdminGuard`. While importing shared guards from `auth` is architecturally acceptable (guards are cross-cutting), it creates tight coupling: the auth module becomes a dependency for every other module.

**Severity:** minor
**Remediation:** Move `JwtAuthGuard`, `AdminGuard`, `CurrentUser` into a shared `common/` or `guards/` module so they are not part of any module's domain.

---

## 3. Missing README.md Per Section 7 Template

**Rule:** AGENTS.md rule — "Every module gets a README.md per the section 7 template" (referencing ARCHITECTURE_AND_SECURITY_RULES.md section 7, which does not exist).

### Finding 3.1 — Zero README.md files in any module directory

| Module Path | README.md |
|-------------|-----------|
| `apps/api/src/admin/` | **Missing** |
| `apps/api/src/api-keys/` | **Missing** |
| `apps/api/src/auth/` | **Missing** |
| `apps/api/src/billing/` | **Missing** |
| `apps/api/src/bullmq/` | **Missing** |
| `apps/api/src/ip-pool/` | **Missing** |
| `apps/api/src/mail/` | **Missing** |
| `apps/api/src/metrics/` | **Missing** |
| `apps/api/src/notifications/` | **Missing** |
| `apps/api/src/prisma/` | **Missing** |
| `apps/api/src/proxmox/` | **Missing** |
| `apps/api/src/resource-pool/` | **Missing** |
| `apps/api/src/ssh-keys/` | **Missing** |
| `apps/api/src/support/` | **Missing** |
| `apps/api/src/vms/` | **Missing** |
| `apps/api/src/voucher/` | **Missing** |
| `apps/api/src/wallet/` | **Missing** |
| `apps/web/src/` (any component) | **Missing** |

**Severity:** should-fix
**Remediation:** Create README.md per module following the template from ARCHITECTURE_AND_SECURITY_RULES.md section 7 (once that file is created). Until then, a practical template: module purpose, providers, exports, key classes, and integration notes.

---

## 4. AuditLog Compliance

**Rule:** AGENTS.md rule 5 — "Every state-changing admin or customer action MUST write an AuditLog row in the same DB transaction as the action itself."

### Finding 4.1 — Only 5 of 49 audit log writes are in the same transaction as their action

| File | Transaction-Compliant Lines | Violations |
|------|---------------------------|------------|
| `vm.service.ts` | Line 86 (VM creation) | Lines 110, 153, 171, 230, 252, 271, 288, 332, 376, 391, 407, 446, 482, 508, 533, 558, 571, 596, 636, 674, 688, 715, 732 — **23 violations** |
| `admin.service.ts` | Line 183 (admin VM creation) | Lines 74, 90, 105, 276, 294, 324, 341, 371, 387, 421, 448, 465, 495, 509, 523, 536, 549, 567, 585, 664, 678, 736, 750, 761, 790, 802, 846, 857, 868, 883 — **30 violations** |
| `wallet.service.ts` | Lines 56, 100 | None (both compliant) |
| `proxmox-job.consumer.ts` | None | Line 177 — **1 violation** (no transaction wrapping the consumer's DB writes) |
| `voucher.service.ts` | None | Lines 31, 111 — **2 violations** |

**Total:** 5 compliant, 56 non-compliant audit log writes.

### Finding 4.2 — ~25 state-changing methods with ZERO audit logs

| Module | Method | What It Changes |
|--------|--------|-----------------|
| `auth/auth.service.ts` | `register` | Creates user, assigns role |
| `auth/auth.service.ts` | `verifyEmail` | Sets emailVerified |
| `auth/auth.service.ts` | `enable2fa` | Enables TOTP |
| `auth/auth.service.ts` | `disable2fa` | Disables TOTP |
| `auth/auth.service.ts` | `forgotPassword` | Sets reset token |
| `auth/auth.service.ts` | `resetPassword` | Changes password, deletes sessions |
| `auth/auth.service.ts` | `logout` | Deletes session |
| `ssh-keys/ssh-keys.service.ts` | `create` | Creates SSH key |
| `ssh-keys/ssh-keys.service.ts` | `delete` | Deletes SSH key |
| `api-keys/api-keys.service.ts` | `create` | Creates API key |
| `api-keys/api-keys.service.ts` | `delete` | Deletes API key |
| `resource-pool/resource-pool.service.ts` | `createPool` | Creates pool |
| `resource-pool/resource-pool.service.ts` | `updatePool` | Updates pool limits |
| `resource-pool/resource-pool.service.ts` | `deletePool` | Deletes pool |
| `resource-pool/resource-pool.service.ts` | `releaseResources` | Deletes allocation |
| `ip-pool/ip-pool.service.ts` | `create`, `update`, `delete` | CRUD IP pools |
| `ip-pool/ip-pool.service.ts` | `addIp`, `removeIp`, `setPtrRecord` | Manage IPs |
| `support/support.service.ts` | `createTicket` | Creates ticket + message |
| `support/support.service.ts` | `reply` | Creates message, updates ticket |
| `voucher/voucher.service.ts` | `redeemVoucher` | Credits wallet, updates voucher — **inside a transaction but no audit log** |
| `billing/billing.service.ts` | `createInvoice` | Creates invoice — **inside a transaction but no audit log** |

### Finding 4.3 — No centralized AuditService

Every audit log is a direct `this.prisma.auditLog.create()` call. The `ipAddress` column in the schema is never populated anywhere.

**Severity:** blocking (all three findings)
**Remediation:** Create an `AuditService` with `log(action, resource, resourceId, metadata, tx)` that enforces transactionality and populates `ipAddress`. Add audit logs for all 25 missing methods. Remove the duplicate audit log at `admin.service.ts:585`.

---

## 5. BullMQ + Idempotency for Proxmox Operations

**Rule:** AGENTS.md rule 4 — "Every Proxmox-mutating operation MUST go through a BullMQ job with an idempotency key column checked before executing."

### Finding 5.1 — 8 Proxmox-mutating operations bypass BullMQ

| # | File | Line | Operation | Severity |
|---|------|------|-----------|----------|
| 1 | `vm.service.ts` | 331 | `this.proxmox.downloadUrl()` — ISO download | blocking |
| 2 | `vm.service.ts` | 565 | `this.proxmox.addFirewallRule()` | blocking |
| 3 | `vm.service.ts` | 578 | `this.proxmox.deleteFirewallRule()` | blocking |
| 4 | `vm.service.ts` | 634 | `this.proxmox.updateVmConfig()` — QEMU hardware config | blocking |
| 5 | `vm.service.ts` | 673 | `this.proxmox.updateVmConfig()` — network set | blocking |
| 6 | `vm.service.ts` | 687 | `this.proxmox.updateVmConfig()` — network delete | blocking |
| 7 | `admin.service.ts` | 671 | `this.proxmoxService.addFirewallRule()` | blocking |
| 8 | `admin.service.ts` | 685 | `this.proxmoxService.deleteFirewallRule()` | blocking |

**All 8 execute synchronously in the request-response cycle:** no idempotency, no retry, no backoff, and the frontend request blocks on the Proxmox API call.

### Finding 5.2 — The 19 operations that DO go through BullMQ are correctly implemented

`create-vm`, `start-vm`, `stop-vm`, `shutdown-vm`, `restart-vm`, `delete-vm`, `suspend-vm`, `resume-vm`, `create-snapshot`, `delete-snapshot`, `backup-vm`, `restore-backup`, `clone-vm`, `resize-vm`, `reinstall-vm`, `mount-iso`, `eject-iso`, `migrate-vm`, `rollback-snapshot` — all have idempotency key checks and are processed in `ProxmoxJobConsumer.executeJob()`.

**Severity:** blocking (Finding 5.1)
**Remediation:** Add job types for `download-url`, `update-vm-config`, `add-firewall-rule`, `delete-firewall-rule` to the BullMQ job type system and route them through `enqueueJob()`.

---

## 6. Resource Pool Admission in Same Transaction

**Rule:** AGENTS.md rule 6 — "Resource pool admission checks MUST happen inside the same DB transaction that reserves the allocation."

### Finding 6.1 — resize-vm flow has a TOCTOU race

| # | File | Lines | What's wrong | Severity |
|---|------|-------|-------------|----------|
| 1 | `vm.service.ts` | 180-219 | `resizeVm()` checks pool capacity in a `$transaction` with `FOR UPDATE` (correct), but the actual `ResourceAllocation` write happens in the consumer later (separate process, no transaction). The window between check and write allows concurrent operations to over-allocate the pool. | **blocking** |
| 2 | `admin.service.ts` | 711-728 | `adminResizeVm()` enqueues `resize-vm` with **no pool capacity check at all**. The allocation write in the consumer can over-allocate without any admission control. | **blocking** |
| 3 | `proxmox-job.consumer.ts` | 76-86 | The `resize-vm` handler updates `ResourceAllocation` outside any transaction, with no `FOR UPDATE` lock, and silently swallows errors (`.catch(() => {})`). | **blocking** |

### Finding 6.2 — VM create and admin VM create are compliant

- `vm.service.ts:51-97` — `createVm()` checks and allocates in same transaction ✓
- `admin.service.ts:149-194` — `adminCreateVm()` checks and allocates in same transaction ✓

**Severity:** blocking (Finding 6.1)
**Remediation:** Option A: Pre-allocate resources (create `ResourceAllocation` with new values) in the same transaction as the pool check, then compensate if Proxmox resized fails. Option B: Re-check pool capacity with `FOR UPDATE` inside the consumer before updating the allocation. Fix silent `.catch()`.

---

## 7. Money Fields

**Rule:** AGENTS.md rule 2 — "NEVER use floating point for money. Integer minor units only."

### Finding 7.1 — All schema money fields are Int (compliant)

| Model | Field | Type | Status |
|-------|-------|------|--------|
| Wallet | `balance` | Int | ✓ |
| Transaction | `amount` | Int | ✓ |
| Invoice | `amount` | Int | ✓ |
| InvoiceLineItem | `unitPrice` | Int | ✓ |
| InvoiceLineItem | `total` | Int | ✓ |
| Payment | `amount` | Int | ✓ |
| VoucherCode | `amount` | Int | ✓ |

### Finding 7.2 — Admin billing-pricing setting uses decimal strings

- **File:** `admin/admin.service.ts:620`
- **What's wrong:** `setBillingPricing` stores dollar-denominated rates (e.g., `"0.005"`) as raw strings in the generic `Setting` model. The frontend submits them as floats. The actual billing service ignores these settings and uses hardcoded integer-cent constants (`VM_PRICE_PER_CORE_HOUR = 50`).
- **Severity:** minor
- **Remediation:** Either remove the dead billing-pricing feature or migrate to integer-cent storage in a dedicated `Pricing` table and wire it into the billing service.

**Overall: PASS** — no floating-point-for-money violations in the database or DTOs.

---

## 8. Placeholders / TODOs / Stubs

**Rule:** AGENTS.md rule 3 — "NEVER write a placeholder, stub, '// TODO: implement', or mock return value in code presented as done."

### Finding 8.1 — No TODO/FIXME/NotImplemented/stub code found

Zero violations. The codebase is well-disciplined.

### Finding 8.2 — Misleading log message

- **File:** `proxmox.service.ts:123`
- **Code:** `this.logger.warn('Proxmox credentials not configured — service will return empty/mock data');`
- **What's wrong:** The service never returns mock data — `assertInitialized()` throws an error before any method returns. The log message is misleading.
- **Severity:** minor
- **Remediation:** Change message to "Proxmox credentials not configured" and consider making the error message clearer at the call site.

**Overall: PASS** — no actual placeholder/stub implementation.

---

## Summary: Prioritized Remediation List

### BLOCKING (fix before any new feature work on affected modules)

| Priority | Finding | Module(s) | Summary | Remediation Effort |
|----------|---------|-----------|---------|-------------------|
| P0 | 6.1 — resize-vm TOCTOU race + silent .catch() | vms, admin, bullmq | Pool admission check and allocation write are not in the same transaction for resize; admin path skips check entirely; consumer silently swallows errors | Medium |
| P0 | 5.1 — 8 Proxmox mutations bypass BullMQ | vms, admin | `updateVmConfig`, firewall operations, `downloadUrl` call Proxmox directly without idempotency | Medium |
| P1 | 4.1 + 4.2 — 56 non-compliant audit logs + 25 missing | ALL | Most audit logs not in same transaction; ~25 state-changing methods have no audit log at all | Large |
| P1 | 1.1 — Zero repository layer (entire codebase) | ALL | Every service accesses Prisma directly; no module boundary encapsulation | Very Large |

### SHOULD-FIX (remediate before or during next phase)

| Priority | Finding | Module(s) | Summary | Remediation Effort |
|----------|---------|-----------|---------|-------------------|
| P2 | 0 — ARCHITECTURE_AND_SECURITY_RULES.md missing | docs | The governance document referenced by AGENTS.md does not exist | Small |
| P2 | 3.1 — Zero README.md files | ALL | No module has a README per section 7 template | Medium |
| P2 | 2.3 — Guards/decorators in auth module create coupling | auth, ALL | Every controller imports from auth; move to shared module | Small |
| P2 | 2.2 — BullmqModule imports consumers directly | bullmq | Consumers registered by importing their files directly | Small |

### MINOR (track for hardening pass)

| Priority | Finding | Module(s) | Summary | Remediation Effort |
|----------|---------|-----------|---------|-------------------|
| P3 | 7.2 — Dead billing-pricing setting uses decimal strings | admin, billing | Feature wired but never consumed; float strings in generic settings | Small |
| P3 | 8.2 — Misleading "mock data" log message | proxmox | Log message is factually wrong | Trivial |
| P3 | 1.2 — Business logic leak in controller | vms | DTO iteration in controller rather than service | Trivial |
| P3 | 4.3 — `ipAddress` never populated in audit logs | ALL | Schema field exists but no caller uses it | Small |

---

## Modules Needing Remediation Before New Feature Work

Sorted by coupling + risk:

1. **vms** — resize TOCTOU + 5 Proxmox bypasses + 23 non-compliant audit logs + missing audit logs on reinstall + zero repository
2. **admin** — resize skips pool check + 2 Proxmox bypasses + 30 non-compliant audit logs + massive cross-module Prisma access + zero repository
3. **bullmq (consumer)** — silent `.catch()` on allocation update + non-transactional audit log + `resize-vm` handler lacks pool admission
4. **auth** — 7 state-changing methods with zero audit logs + zero repository
5. **voucher** — `redeemVoucher` inside a transaction with no audit log + 2 non-compliant audit logs + zero repository
6. **billing** — `createInvoice` inside a transaction with no audit log + zero repository
7. **resource-pool** — 4 state-changing methods with zero audit logs + zero repository
8. **ip-pool** — 5 state-changing methods with zero audit logs + zero repository
9. **ssh-keys / api-keys** — create/delete with zero audit logs + zero repository
10. **support** — createTicket/reply with zero audit logs + zero repository

**Verdict:** No module currently passes all architecture rules. The `vms`, `admin`, and `bullmq` modules carry the highest-risk violations and should be remediated first. The repository layer is the structural foundation — without it, cross-module Prisma access cannot be prevented.
