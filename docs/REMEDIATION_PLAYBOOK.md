# CloudNest — Remediation Playbook

## Why this needs its own process, not just "go clean it up"

Refactoring code that's already running (even in dev, even at 60% built)
is riskier than writing new code, for one specific reason: **you can't tell
the difference between "made it cleaner" and "quietly changed behavior"
without something checking that behavior stayed the same.** This is
especially dangerous in a billing/resource-allocation system — a "cleanup"
that subtly changes how a transaction boundary works can turn into double
billing or double-provisioning that nobody notices until a customer
complains.

So: remediation follows a stricter process than fresh feature work. This
document is that process. Run it after `/docs/ARCHITECTURE_AUDIT.md` exists.

---

## The golden rule

**Never restructure a piece of code that doesn't have a test proving its
current behavior first.** If the audit found a module with no tests, the
first task for that module is writing tests that lock in what it
currently does — even if what it currently does has bugs — before touching
its structure. You fix bugs and you fix structure as two separate,
separately-reviewable steps, never in the same commit.

This is called a **characterization test**: it documents actual current
behavior, not intended behavior. Once it's green, you refactor freely and
the moment that test goes red, you know you changed something — on
purpose or not.

---

## Remediation order (triage the audit report into these buckets)

### Bucket 1 — Blocking, fix immediately, before any new features
- Money stored as float anywhere
- Missing audit log on a financial or destructive action
- Missing idempotency key on a Proxmox-mutating job
- Resource-pool check-then-act across two queries (race condition risk)
- Any direct Proxmox API exposure outside `ProxmoxService`

These are correctness/security issues, not style issues. Pause new feature
work on the affected module until these are fixed.

### Bucket 2 — Structural, fix opportunistically but on a deadline
- Business logic in a controller instead of a service
- Cross-module repository/Prisma imports
- God services (files far past the ~300 line soft ceiling doing several
  unrelated things)
- Missing typed exceptions (stringly-typed errors)

Fix these module-by-module, prioritized by which modules the next 2–3
features will actually touch — no point restructuring a module you're not
going near for months, that's effort spent on the wrong thing.

### Bucket 3 — Polish, fix as you touch the file anyway
- Missing `README.md` per module
- Missing Swagger annotations
- Inconsistent naming
- Non-exhaustive switch statements on enums

Never block feature work for these. Fix them in the same PR as any other
change to that file, never as a standalone "polish" PR that touches
dozens of files at once (that kind of PR is impossible to review properly
and is exactly how a refactor accidentally introduces a regression that
slips through).

---

## The per-module remediation loop

For each module being remediated, in this order, every time:

1. **Read the audit finding(s) for this module.**
2. **Check test coverage.** If the code path being touched has no test,
   write a characterization test first — run it against the *current*
   code, confirm it passes, commit it standalone before touching anything
   else.
3. **Fix Bucket 1 issues for this module first**, if any, as their own
   commit(s). Re-run tests. Confirm nothing outside this module broke
   (run the full test suite, not just this module's).
4. **Then do structural remediation (Bucket 2)** as separate commit(s).
   Same rule: tests green before and after, full suite run, not just the
   touched module.
5. **Manually smoke-test the actual behavior** against the real Proxmox
   host / real DB for anything touching VM lifecycle or billing — an
   integration test passing isn't proof enough for the riskiest paths.
6. **Only after 3–5 are done**, address Bucket 3 polish for this module in
   the same PR.
7. **One module per PR.** Never bundle remediation of module A and module
   B in the same PR, even if they're related — makes review and rollback
   clean.

---

## Special case: remediating billing/financial logic

If Bucket 1 or 2 remediation touches anything that calculates or moves
money (credit balances, invoice totals, subscription renewal amounts,
resource pool math):

- Add the characterization test using **real historical data shapes** from
  the existing DB if any test data exists, not just hand-crafted happy-path
  numbers — off-by-one and rounding bugs hide in edge cases (proration,
  partial-period billing, discount stacking).
- Consider a **dark-launch pattern**: run the new logic alongside the old
  logic for a period, logging both outputs without acting on the new one,
  and diff them before cutting over. Overkill for a pre-launch dev system,
  but worth doing once you have real paying customers and are remediating
  live billing code later.
- Never remediate financial logic and add a new financial feature in the
  same session — these need to be reviewable independently.

---

## What to tell OpenCode to start remediation

Run this only after `/docs/ARCHITECTURE_AUDIT.md` exists and you've
reviewed it yourself at least once.

```
Read /docs/ARCHITECTURE_AUDIT.md, /docs/ARCHITECTURE_AND_SECURITY_RULES.md,
AGENTS.md, and /docs/REMEDIATION_PLAYBOOK.md in full.

We are starting remediation. Take the Bucket 1 (blocking) findings from the
audit report, and list them ordered by which module they're in. For the
FIRST module on that list only:

1. Show me the current test coverage for the code paths affected by the
   Bucket 1 finding(s) in this module.
2. If coverage is missing, write characterization tests first, run them
   against the current code, confirm green, and stop — show me the tests
   and ask before proceeding to any fix.
3. Do not fix anything yet. Do not touch a second module. Do not address
   Bucket 2 or 3 items for this module in this session.

This is deliberately narrow in scope — we're doing one module's Bucket 1
issue at a time, with a human checkpoint after the characterization tests
and before any actual fix.
```

After that checkpoint, the next message authorizes the actual fix:

```
Characterization tests look correct. Now fix the Bucket 1 issue(s) in this
module. Re-run the full test suite (not just this module's tests), confirm
everything is still green, and show me a diff-level summary of exactly
what changed and why. Stop after this one module — do not move to the next
one without confirmation.
```

Repeat this two-message pattern per module. It's slower than "fix
everything," on purpose — each checkpoint is where you catch a
misunderstanding before it compounds across the whole Bucket 1 list.

---

## After Bucket 1 is clear

Re-run the audit (`/docs/ARCHITECTURE_AUDIT.md` regenerated, not hand-
edited) to confirm Bucket 1 findings are actually gone and nothing new
was introduced, before starting Bucket 2. Then move to Bucket 2 using the
same per-module, two-message checkpoint pattern, prioritized by which
modules your next planned features will touch.