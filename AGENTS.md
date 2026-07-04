# CloudNest — AGENTS.md

## What this project is
CloudNest is a self-service VPS hosting platform built on NestJS + Prisma +
PostgreSQL + Redis/BullMQ (backend) and Next.js + Tailwind (frontend), running
against a real Proxmox VE host. Full spec and phase plan: see
`/docs/CloudNest_Master_Plan.md` — read it before starting any phase.

Architecture, module structure, and security rules are defined in
`/docs/ARCHITECTURE_AND_SECURITY_RULES.md` — read it before writing or
modifying ANY code, not just new modules. This file governs how code is
shaped; the master plan and billing spec govern what gets built.

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
11. Follow the four-layer structure from ARCHITECTURE_AND_SECURITY_RULES.md
    (controller → service → repository → Prisma) for every module, existing
    or new. Never import another module's repository or Prisma models
    directly — go through that module's service or a domain event.
12. If a change to EXISTING code would require breaking a rule in
    ARCHITECTURE_AND_SECURITY_RULES.md (e.g., no way to avoid a cross-module
    repository import without a larger refactor), STOP and flag it instead
    of silently doing it anyway or silently refactoring something out of
    scope. Ask which to prioritize.

## Definition of Done for any task
- Code compiles, typechecks, lints clean
- Tests written and passing (unit for logic, integration for the flow)
- Swagger docs updated for any new/changed endpoint
- Audit logging present for state-changing actions
- No placeholder logic, no hardcoded fake data presented as real
- Structure matches ARCHITECTURE_AND_SECURITY_RULES.md (layering, module
  boundaries, no cross-module Prisma access)
- A one-paragraph summary of what changed and what to manually verify

## When starting a new phase
State which phase you're starting, restate that phase's Definition of Done
from the master plan, and confirm scope boundaries before writing code.

## Working in an already-partially-built codebase
This project is roughly 60% built as of the architecture rules being
introduced. Existing code was not necessarily written against
ARCHITECTURE_AND_SECURITY_RULES.md. When touching an existing module:
1. Check it against that document before extending it.
2. If it violates a structural rule (wrong layering, cross-module Prisma
   access, missing audit logs, missing idempotency), do NOT silently
   rewrite it as a side effect of an unrelated task — flag the violation,
   propose a scoped remediation, and let the human decide whether to fix it
   now or track it for the audit pass.
3. New code added to an existing module must follow the rules even if the
   surrounding code doesn't yet — don't match bad patterns for consistency.