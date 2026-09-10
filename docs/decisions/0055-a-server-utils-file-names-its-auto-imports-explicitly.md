# 0055: A `server/utils/` file that `tests/` can reach names its own auto-imports explicitly

- Status: Accepted
- Date: 2026-09-10

## Context

Four files have now broken `bun run typecheck:bun` the same way, each discovered by a red CI on
a pull request that never touched the file: `server/utils/configuration.ts`, `notify.ts`,
`ledger.ts`, and `access-profiles.ts` (found fixing D-128). The shape is identical every time:
ten or so `TS2304` errors naming `db`, `schema`, `createError` and a couple of local helpers, the
moment the file enters `tests/`'s Bun compile graph because some new test transitively imports
it. Nuxt auto-imports `server/utils/` into the application (CONTRIBUTING, "everything in
`server/utils/` is auto-imported into server code the same way"), so the file typechecks and
lints cleanly under Nuxt; `tsconfig.bun.json` has no auto-import mechanism at all, so the same
file typechecks under Bun only if every value it uses is a real, named import.

Both halves of that are deliberate, not oversights, which rules out the two answers that look
obvious from either side alone.

**Making `tsconfig.bun.json` see Nuxt's generated auto-import types is not simply adding a
`types` entry.** It sets `"types": ["bun"]` specifically so `tests/`, `scripts/` and
`migration/` typecheck against Bun's own ambient globals, deliberately kept apart from the
application's. 0053 (`TS2589` in Nitro's typed route map) was partly about the cost of the two
graphs disagreeing; pulling Nuxt's auto-import declarations into the Bun graph would very
plausibly pull the same `InternalApi`/`$Fetch` machinery in behind them, since Nuxt's generated
`imports.d.ts` declares `$fetch`-shaped globals and Nitro's route-map augmentation is ambient
once loaded into any compilation unit that includes it. That is the specific, concrete way this
answer risks re-opening 0053's class of defect rather than fixing this one.

**A lint rule refusing an auto-imported identifier in `server/utils/` is a real inversion of a
documented convention, not a small addition.** Every symptom seen so far is a value with a real
importable source (a package, or a sibling file in `server/utils/`), so a rule is technically
buildable. But applied narrowly, scoped only to files `tests/` currently reaches, it has the same
property as the problem it is meant to solve: silent until reachability changes, just caught by
`lint` instead of `typecheck:bun`. Applied broadly, to every file in `server/utils/` regardless
of whether anything reaches it yet, it reverses CONTRIBUTING's own stated convention for the
whole directory, which is not this record's call to make unilaterally and would touch files
across every stream's ownership for a problem four files have hit in months of building.

## Decision

**Write the pattern down where the author looks, rather than fix the boundary.** Each affected
file already carries the fix `configuration.ts` set the pattern for: name the auto-imported
value explicitly, with a comment reading "Named rather than taken from Nitro's auto-imports,
because `tests/` typechecks this file under Bun, where nothing is auto-imported." That comment
is correct and stays. What was missing is a place a fifth occurrence finds in thirty seconds
rather than by re-deriving the mechanism: this record, and a pointer to it in CONTRIBUTING.md
next to the auto-import convention itself, so the two facts that collide sit next to each other
rather than one implying the other silently.

A `server/utils/` file is written normally, auto-imported, until `bun run typecheck:bun` names
it. When it does: name every flagged value with its real import (a package for `db`/`schema`/
`createError`, a relative path for a sibling `server/utils/` helper), citing this record rather
than re-explaining it. Nothing else about the file changes; this is not a reason to restructure
it or move it out of `server/utils/`.

## Consequences

- The fix stays mechanical and cheap, exactly as it has been for all four files so far: a few
  minutes once found, at the cost of being found by a stranger's red CI rather than the author's
  own desk.
- If a fifth, sixth and seventh file hit this in quick succession, that frequency is itself new
  evidence, and worth re-opening this record's Options section rather than assuming the answer
  reached here still holds. Nothing here forecloses reconsidering candidate two at estate scale,
  only says it is not this record's decision to make from one file's fix.

## Options considered

- **Add Nuxt's generated auto-import types to `tsconfig.bun.json`.** Rejected: risks pulling the
  typed route map into the Bun graph, the specific mechanism 0053 spent three rounds
  establishing is expensive at the route counts this estate already has.
- **A lint rule requiring explicit imports across all of `server/utils/`.** Rejected as this
  record's call: real estate-wide convention reversal, cross-stream, for four occurrences.
