# CloudNest — Master Build Plan & OpenCode Operating Manual

## How to use this document

This is not a single prompt. It's a **campaign plan**. You will run
[OpenCode](https://opencode.ai) in a dedicated git repo, one phase at a time,
in order. Each phase has its own "launch prompt" at the bottom you paste into
OpenCode verbatim (edited with your real Proxmox host details). Do not skip
ahead — later phases assume earlier ones are tested and merged.

Why phased instead of "build the whole platform now":
- A single mega-prompt produces breadth without depth — 40 half-working
  modules instead of 8 solid ones.
- You need to validate the hardest architectural bet (resource-pool admission
  control against real Proxmox) before investing in vouchers, invoices, and
  dashboards built on top of it.
- OpenCode (and any coding agent) does its best work with a bounded, testable
  unit of work and a clear Definition of Done.

---

## 0. Non-negotiable architecture decisions (lock these before Phase 1)

| Decision | Choice | Why |
|---|---|---|
| Backend | NestJS + TypeScript | DI, module boundaries map cleanly to your domain modules |
| ORM | Prisma + PostgreSQL | Migrations are reviewable diffs; good for audit-heavy schema |
| Queue | Redis + BullMQ | Every Proxmox op is async and must be retryable/idempotent |
| Proxmox access | Backend-only, via a dedicated `ProxmoxService` wrapper | Never expose Proxmox API to frontend or internet |
| Auth | JWT access token (short-lived) + rotating refresh token in httpOnly cookie | Standard, avoids XSS token theft |
| Frontend | Next.js (App Router) + Tailwind | SSR for dashboard pages, good DX |
| Realtime | WebSocket gateway in NestJS (Socket.IO) for VM status/console/monitoring | Polling Proxmox from the browser is not acceptable |
| Node abstraction | `Node` table exists from day one, even with one row | Prevents hardcoding single-node assumptions into scheduler/VM logic |
| Money | Store as integer minor units (cents), never float | Standard financial-data hygiene |
| Idempotency | Every Proxmox-mutating job has an idempotency key stored in DB | Prevents double-charging / double-provisioning on retry |

Give OpenCode this table verbatim at the start of Phase 1 and tell it these
are fixed, not up for reinterpretation.

---

## 1. Phase roadmap

Each phase = one OpenCode engagement (could be one long session or several
sessions with `/compact` checkpoints). Do not start phase N+1 until phase N
has passing tests and you've manually smoke-tested it against your real
Proxmox host.

### Phase 0 — Repo & environment scaffolding
- Monorepo structure (`apps/api`, `apps/web`, `packages/shared-types`)
- Docker Compose: Postgres, Redis, NestJS, Next.js, adminer
- `.env.example` with every variable documented
- CI skeleton (lint + typecheck + test on push)
- **Definition of Done:** `docker compose up` gives a running empty NestJS
  app with Swagger at `/api/docs`, and an empty Next.js app, both hot-reloading.

### Phase 1 — Auth & identity core
- User registration, email verification, login, JWT + refresh rotation, 2FA
  (TOTP), password reset, session management, Argon2 hashing
- RBAC skeleton: `Role`, `Permission`, `UserRole` tables + guard decorators
- **Definition of Done:** Can register → verify email (log to console in dev,
  real SMTP later) → login → enable 2FA → hit a protected route → refresh
  token → logout. Unit tests on auth service, integration test on full flow.

### Phase 2 — Proxmox integration layer (the risky part, do it early)
- `ProxmoxService`: wraps Proxmox REST API (auth ticket + CSRF token
  handling, node/VM listing, VM create/start/stop/delete/clone, cloud-init
  config injection, VNC ticket generation)
- `Node` and `NodeInventory` tables, seeded with your one real R730XD node
- BullMQ queue `proxmox-jobs` with retry/backoff, idempotency key column
- **Definition of Done:** From a NestJS admin script (not UI yet), you can
  create a real VM on your R730XD from cloud-init template, see it appear via
  `qm list` equivalent, start/stop it, delete it. This is your proof the
  hardest integration works before any customer-facing code exists.

### Phase 3 — Resource pool & admission control (your core differentiator)
- `ResourcePool` (purchased totals per customer), `ResourceAllocation`
  (per-VM consumption), computed "available = purchased - sum(allocated)"
- Admission logic: reject VM create/resize if it would exceed pool, enforced
  at the DB transaction level (not just app-level check) to survive
  concurrent requests
- **Definition of Done:** Integration test proves two concurrent VM-create
  requests against a pool with only enough room for one — exactly one
  succeeds, one is rejected with a clear error, no overcommit.

### Phase 4 — Customer VM lifecycle (connects Phase 2 + Phase 3 to real users)
- Create/delete/start/stop/restart/resize VPS, reinstall OS, mount ISO
- noVNC console: short-lived single-use token issued by backend, proxied,
  never a raw Proxmox ticket sent to browser
- WebSocket gateway pushing VM status changes to frontend
- **Definition of Done:** A logged-in customer can create a VM within their
  resource pool, watch it provision in real time, open console, reboot it,
  delete it. Full audit log entries for every action.

### Phase 5 — Wallet, vouchers, billing engine
- Wallet balance, transaction ledger (append-only, never mutate past rows)
- Voucher redemption with all constraint fields from your spec
- Billing engine: hourly usage-tick job (BullMQ repeatable job) →
  invoice line items → wallet deduction → suspend-at-zero state machine
  (active → grace → suspended → scheduled_deletion → deleted)
- **Definition of Done:** Simulated clock-forward test proves a VM
  correctly bills hourly, drains wallet, suspends, and enters grace period;
  reconciliation job catches any drift between DB state and actual Proxmox
  VM power state.

### Phase 6 — Admin panel
- Dashboard, customer management, server/node view, VM oversight, voucher
  CRUD, wallet manual credit, invoice/payment views, IP pool manager, logs
- **Definition of Done:** Admin can do everything the spec lists without
  touching a terminal or the Proxmox UI directly.

### Phase 7 — Customer panel polish
- Full dashboard, statistics/bandwidth graphs, invoices, SSH key management,
  API keys, support tickets, notifications, dark/light mode
- **Definition of Done:** UI parity with the "inspired by DigitalOcean/
  Hetzner" bar — usable by a non-technical customer end to end.

### Phase 8 — Hardening pass
- Rate limiting, CSRF, security headers, dependency audit, load test the
  billing job under concurrency, pen-test checklist pass, backup/restore
  drill for the platform's own database
- **Definition of Done:** You could put this in front of paying customers.

### Deferred / explicitly out of v1 scope (revisit after Phase 8)
- Windows Server images, SPICE console, multi-node scheduler logic beyond
  the abstraction layer, Ceph/HA, live migration, crypto payment gateway.
  These are designed for (tables/interfaces exist) but not implemented,
  so v1 doesn't collapse under its own scope.

---

## 2. Database schema — core entities to hand OpenCode in Phase 0/1

Give this list as the schema skeleton; let OpenCode write full Prisma
models with proper relations, but keep these entities and relationships fixed:

```
User, Role, Permission, UserRole, Session, ApiKey, SshKey
Wallet, Transaction, Invoice, InvoiceLineItem, Payment
VoucherCode, VoucherRedemption
Node, NodeInventory, StoragePool, IpPool, IpAddress
ResourcePool, ResourceAllocation
Vm, VmTemplate, OperatingSystem, Snapshot, Backup
AuditLog, Notification, SupportTicket, SupportTicketMessage
Setting
```

Rules to give OpenCode explicitly:
- `Transaction` and `AuditLog` are append-only — no update/delete methods
  exposed anywhere in the service layer.
- Money fields: `Int` (minor units), never `Float`/`Decimal` unless Prisma
  `Decimal` with explicit precision for anything crossing a payment gateway.
- Every table that represents a Proxmox-linked resource (`Vm`, `Snapshot`,
  `Backup`) has a `proxmoxId`, `nodeId`, and `status` enum with an explicit
  state machine, not a free-text string.

---

## 3. OpenCode operating instructions (paste this once, at repo init)

OpenCode's project-rules file is **`AGENTS.md`** at the repo root (not
`CLAUDE.md` — that's the Claude Code convention; OpenCode falls back to
reading `CLAUDE.md` only if no `AGENTS.md` exists, so don't rely on the
fallback). It's loaded into every session automatically.

Two ways to create it:
1. Run `/init` inside OpenCode once Phase 0 scaffolding exists — it scans the
   repo and generates a draft `AGENTS.md`, which you then hand-edit to add
   the rules below. If one already exists, `/init` improves it in place.
2. Or just create the file manually with the content below before Phase 0.

Keep it under ~100 lines where possible — OpenCode's own docs note overlong
rules files get partially ignored. The rules below are dense on purpose; trim
commentary if you add project-specific detail later.

```markdown
# CloudNest — AGENTS.md

## What this project is
CloudNest is a self-service VPS hosting platform built on NestJS + Prisma +
PostgreSQL + Redis/BullMQ (backend) and Next.js + Tailwind (frontend), running
against a real Proxmox VE host. Full spec and phase plan: see
`/docs/CloudNest_Master_Plan.md` — read it before starting any phase.

## Non-negotiable rules
1. NEVER expose the Proxmox API to the frontend or any public route. All
   Proxmox calls go through `apps/api/src/proxmox/proxmox.service.ts`.
2. NEVER use floating point for money. Integer minor units only.
3. NEVER write a placeholder, stub, "// TODO: implement", or mock return
   value in code presented as done. If something can't be finished in this
   session, say so explicitly and stop — do not fake completion.
4. Every Proxmox-mutating operation (create/delete/start/stop/resize/
   snapshot/backup) MUST go through a BullMQ job with an idempotency key
   column checked before executing, so retries never double-provision or
   double-bill.
5. Every state-changing admin or customer action MUST write an AuditLog row
   in the same DB transaction as the action itself, not as an afterthought.
6. Resource pool admission checks MUST happen inside the same DB transaction
   that reserves the allocation — never check-then-act across two queries.
7. Work only within the current phase's scope (see master plan). If a
   request implies work from a later phase, flag it and ask before proceeding.
8. After implementing a unit of work: run lint, typecheck, and tests before
   declaring it done. Show me the output, not just a claim it passes.
9. Do not invent Proxmox API behavior. If uncertain about an endpoint or
   response shape, say so and ask me to confirm against the real host
   (reachable at PROXMOX_HOST in .env) rather than guessing.
10. Every new module gets: DTOs with class-validator, a service with the
    business logic, a controller that's thin, and at least one integration
    test for the primary flow and one for the primary failure mode.

## Definition of Done for any task
- Code compiles, typechecks, lints clean
- Tests written and passing (unit for logic, integration for the flow)
- Swagger docs updated for any new/changed endpoint
- Audit logging present for state-changing actions
- No placeholder logic, no hardcoded fake data presented as real
- A one-paragraph summary of what changed and what to manually verify

## When starting a new phase
State which phase you're starting, restate that phase's Definition of Done
from the master plan, and confirm scope boundaries before writing code.
```

---

## 4. Phase launch prompts (paste one at a time, in order)

### Phase 0 launch prompt
```
Read /docs/CloudNest_Master_Plan.md and AGENTS.md in full before doing anything.

Start Phase 0: repo & environment scaffolding, as defined in the master plan.
Build the monorepo structure, Docker Compose stack (Postgres, Redis, NestJS
api, Next.js web, adminer), .env.example with every variable documented, and
a CI skeleton (lint + typecheck + test on push).

Stop when `docker compose up` gives a running empty NestJS app with Swagger
at /api/docs and a running empty Next.js app, both hot-reloading. Show me
the commands you ran to verify this and their output.
```

### Phase 1 launch prompt
```
Phase 0 is merged and verified. Start Phase 1: auth & identity core, per the
master plan. Implement registration, email verification (log verification
link to console in dev), login, JWT access + rotating refresh token in
httpOnly cookie, TOTP-based 2FA, password reset, session management, Argon2
hashing, and the RBAC skeleton (Role/Permission/UserRole + guard decorators).

Definition of Done: I can register, verify, login, enable 2FA, hit a
protected route, refresh the token, and logout. Unit tests on the auth
service and an integration test covering the full flow. Show me test output.
```

### Phase 2 launch prompt
```
Phase 1 is merged and verified. Start Phase 2: the Proxmox integration
layer — the highest-risk part of this project, so take it slowly and do not
guess at API behavior.

My real Proxmox host details:
  Host: <your-proxmox-ip-or-hostname>
  API token or user/pass: <fill in — prefer an API token, not root password>
  Node name: <your node name, e.g. pve>
  Storage pool: <e.g. local-lvm>

Build ProxmoxService wrapping auth ticket/CSRF handling and VM
create/start/stop/delete/clone/cloud-init-config/VNC-ticket operations. Seed
the Node and NodeInventory tables with this one real node. Set up the
proxmox-jobs BullMQ queue with retry/backoff and an idempotency key column.

Definition of Done: via an admin script (not UI), create a real VM on my
node from a cloud-init template, confirm it's visible in the Proxmox UI,
start it, stop it, delete it. Paste the actual commands/output you used to
verify against my real host, not simulated output.
```

### Phase 3 launch prompt
```
Phase 2 is merged and verified against my real Proxmox host. Start Phase 3:
resource pool & admission control — this is the platform's core
differentiator, so the concurrency guarantee matters more than speed.

Build ResourcePool (purchased totals per customer) and ResourceAllocation
(per-VM consumption), with admission logic enforced inside the same DB
transaction as the allocation write — not a separate check-then-act.

Definition of Done: an integration test that fires two concurrent VM-create
requests against a pool with room for exactly one, and proves exactly one
succeeds while the other is cleanly rejected, with no overcommit possible
even under real concurrency. Show me the test and its output.
```

*(Continue this pattern for Phases 4–8, each referencing the master plan's
Definition of Done for that phase. By Phase 4 you'll have enough context
established that shorter launch prompts referencing "per the master plan,
Phase N" are sufficient.)*

---

## 5. Session hygiene tips specific to OpenCode

- Keep each phase in its own feature branch; only merge to main after you've
  manually smoke-tested against your real R730XD.
- When an OpenCode session gets long, use `/compact` before starting new
  work, not mid-task — compacting mid-task loses working context on the
  exact thing it's doing.
- If OpenCode proposes a placeholder or mock "to keep moving," stop it —
  that's rule 3 in AGENTS.md being violated; ask it to either finish the real
  implementation or explicitly tell you what's blocking it.
- Re-paste the phase's Definition of Done at the start of any session that
  resumes mid-phase — don't assume it's retained perfectly across compacts.
