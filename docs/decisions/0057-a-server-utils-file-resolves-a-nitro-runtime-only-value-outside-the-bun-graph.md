# 0057: A `server/utils/` file resolves a Nitro-runtime-only value outside the Bun graph, and never imports it, static or dynamic

- Status: Accepted
- Date: 2026-09-10

## Context

0055 covers a `server/utils/` file that `tests/` can reach breaking `bun run typecheck:bun`
because a value it uses has no auto-import under Bun (`tsconfig.bun.json` sets `types` to `bun`
alone, deliberately, so `tests/`, `scripts/` and `migration/` typecheck against Bun's own ambient
globals). Its answer: name the value with a real, importable source, citing 0055. Four files fit
that shape: `configuration.ts`, `notify.ts`, `ledger.ts`, `access-profiles.ts`.

`server/utils/access-profile-crypto.ts`, found fixing D-128 (#795), does not. D-128 pulled it into
the same Bun compile graph transitively, through `access-profiles.ts` (`doorWordingFor`) behind
`desk.ts`, which `tests/unit/desk.test.ts` imports. Its first fix (`84252f98`) named `createError`
and `useRuntimeConfig` the same way 0055 prescribes, and it did not work: `useRuntimeConfig` is
not a plain value with a real importable source under Bun. Importing `'nitropack/runtime'`
statically reaches into Nitro's build-time virtual modules, which do not exist outside a real
build, so `bun run test` crashed the moment it loaded the file, before any assertion ran, not
merely failed to typecheck it. The second fix (`367a044a`) moved the import inside
`encryptionKey()` and made it dynamic, so the crashing statement is never evaluated, because
nothing `tests/` reaches ever calls that function today.

0055 does not say whether that second fix is the right one. Read literally ("name every flagged
value with its real import"), it reads as permission: `useRuntimeConfig` got named, imported, and
CI went green. That is the gap this record closes, without reopening or editing 0055, whose
answer for the first shape is unchanged and still correct.

## The distinction

A named, static import fixes 0055's shape because the value genuinely exists independent of a
running Nitro server: `db` and `schema` come from a package, `createError` from `h3`, a sibling
helper from a file next to it. Bun can resolve and evaluate all of them standing alone.
`useRuntimeConfig` cannot be fixed the same way by any import, static or dynamic, because the
module behind it is not really there under Bun; a dynamic import does not resolve that, it only
postpones the attempt from load time to call time, and papers over the crash only as long as
nothing on a path `tests/` reaches ever calls the function. Nothing enforces that. It is an
invariant carried by a two-line comment, not a type, and the first unit test that exercises
`doorWordingFor`'s decrypt path for real, which is exactly what D-127's own coverage will
eventually want, reintroduces the crash the dynamic import was written to hide, with no CI signal
pointing at the cause.

It is also not behaviour-neutral, which is a second, independent objection: moving
`useRuntimeConfig()` from module load to first call changes an isolate from resolving its
encryption key eagerly to resolving it cold on whichever request happens first, which is exactly
the distinction the `sessionPassword` memoisation in `server/plugins/0.secrets-store.ts` was built
to avoid for a sibling secret.

The estate already has both of the patterns that solve this properly, in code, today:

- **`server/utils/pass-confirmation.ts`** calls `useRuntimeConfig(event)` freely, with no
  import-boundary workaround at all, because nothing under `tests/` reaches it: its header records
  that it is "kept apart from `server/utils/pass-issue.ts`, which `tests/` imports directly under
  Bun". The Nitro-runtime-dependent code lives in a file the Bun graph never has reason to load,
  so the constraint never applies to it.
- **`server/plugins/0.secrets-store.ts`** resolves `SESSION_PASSWORD` once per isolate, in a
  plugin, ahead of anything that reads a session, and writes the resolved value into
  `runtimeConfig` for everything downstream to read as a plain value. Nothing in `server/utils/`
  calls `useRuntimeConfig()` for the session seal; the one place that does is a file nothing under
  `tests/` imports.

`access-profile-crypto.ts` fits neither pattern as written, because its own exported functions are
what `access-profiles.ts` calls for real business logic (`payloadOf`, hence `doorWordingFor` and
every write path), so the file cannot simply move out of the reachable graph the way
`pass-confirmation.ts` does. What it can do is stop resolving its own secret: take the raw key, or
a resolved `CryptoKey`, as a value threaded in from a caller that already sits outside the Bun
graph, the same shape `0.secrets-store.ts` already uses for a sibling secret.

## Decision

**Which server utilities belong in the Bun graph at all is not a per-file choice; it is settled by
what the file's own reachable code depends on.** A `server/utils/` file's presence in `tests/`'s
Bun compile graph is incidental, not a decision anyone makes: it happens the moment some test,
directly or transitively, imports it. The question that matters is narrower: does any code on a
path `tests/` can reach, module scope included, depend on something that only exists inside a real
Nitro build? `useRuntimeConfig`, and anything else that reaches into Nitro's build-time virtual
modules, is that thing. No import statement fixes that dependency, because the target of the
import is not really there under Bun; static or dynamic changes only when the missing module is
reached for, not whether it exists.

Two fixes are legitimate for that case, and a same-file dynamic import is not a third:

1. **The Nitro-runtime-dependent code is not needed by anything `tests/` reaches.** Move it to a
   sibling file nothing under `tests/` imports, even transitively, following `pass-confirmation.ts`
   / `pass-issue.ts`. The Bun graph then never has a reason to load it, and no workaround is
   needed at all.
2. **The value is needed by logic `tests/` does reach.** Stop resolving it inside the reachable
   file. Resolve it once, outside the Bun graph, in a plugin or a route, the same shape
   `0.secrets-store.ts` already uses for `SESSION_PASSWORD`, and thread the resolved value in as a
   parameter. The reachable file becomes a plain function of its inputs, which is what Bun can
   already typecheck and run.

A dynamic `import()` of a Nitro-runtime-only module, inside a function, to satisfy `bun run test`
rather than `bun run typecheck:bun`, is refused as a pattern going forward. It survives only by an
invariant nothing enforces, and it changes when the module resolves, a real behavioural change for
anything meant to be resolved once per isolate. `access-profile-crypto.ts`'s `367a044a` is flagged
to box office as needing fix 2 above; it is not adopted as precedent by this record, and this
record does not itself change that file.

0055's own answer is unchanged: a plain value with a real importable source gets a named import,
citing 0055. This record answers the question 0055 was silent on, rather than replacing it.

**Why not pull Nuxt's auto-import types into `tsconfig.bun.json`, so this whole class of failure
disappears at the config level?** Rejected, for the reason already on record in 0055: it risks
pulling the typed route map into the Bun graph, the specific mechanism 0053 spent three rounds
keeping out. It would not have helped `access-profile-crypto.ts` regardless: its failure was never
a typecheck error borrowed from a missing auto-import type, it was `bun run test` crashing on a
real module Bun cannot resolve, which no type declaration changes.

**Why not a lint rule requiring explicit imports across all of `server/utils/`?** Rejected for the
same reason 0055 rejects it: an estate-wide convention reversal, cross-stream, for a handful of
occurrences. It also would not have caught `access-profile-crypto.ts`'s real failure, which was
never about an identifier lacking an import.

## Consequences

- `access-profile-crypto.ts` on `unified/box-office/D-128` (merged as #795) still carries the
  dynamic-import workaround as of this record; box office has been asked separately to replace it
  with fix 2. This record does not itself change that file.
- The next occurrence, if there is one, is judged against the distinction in this record: a plain
  value gets a named import, per 0055; anything that only exists inside a real Nitro build gets
  resolved outside the Bun graph and threaded in, never imported from inside it, static or
  dynamic, per this record.
- `CONTRIBUTING.md` gains one sentence next to 0055's, pointing here for the Nitro-runtime-only
  case, so the two facts a future author needs sit together rather than one being found by
  rediscovering the mechanism.

## Options considered

- **Add Nuxt's generated auto-import types to `tsconfig.bun.json`.** Rejected: risks pulling the
  typed route map into the Bun graph, the specific mechanism 0053 spent three rounds keeping out,
  and would not have fixed `access-profile-crypto.ts`'s crash regardless.
- **A lint rule requiring explicit imports across all of `server/utils/`.** Rejected for 0055's own
  reason: real estate-wide convention reversal, cross-stream, for a handful of occurrences, and
  blind to this record's actual failure, which was never about a missing import.
- **A same-file dynamic `import()` of the Nitro-runtime-only module, to satisfy `bun run test`.**
  Rejected as a pattern: does not remove the dependency, only defers when it is reached for; rests
  on an unenforced invariant; not behaviour-neutral for a value meant to be resolved once per
  isolate.
