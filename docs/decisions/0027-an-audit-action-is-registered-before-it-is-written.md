# 0027: An audit action is registered before it is written

- Status: Accepted
- Date: 2026-08-29

## Context

The trail is append-only and trigger-enforced (0010), and erasure can redact a detail that picked
up an identifying value (0011). Neither says anything about what may be written in the first place.

By the time eleven endpoints were writing entries, three things had gone wrong quietly. Actions
were free-form strings validated only for shape, so `session.started.totp` and a hypothetical
`session.started.TOTP` were equally acceptable and would have become two categories in the same
report. Details recording a state change used three shapes: `{ from, to }` at the top level,
`{ key, from, to }`, and most often nothing at all. And nothing enforced that a privileged mutation
recorded anything: `CLAUDE.md` lists a missing audit write as a review flag, which means it was
enforced by whoever remembered.

Eleven endpoints is a cheap retrofit. The modules land weekly from September, and thirty is not.

## Decision

**An audit action must be registered in `shared/utils/audit-actions.ts` before `auditEntry` will
write it.** The catalogue is closed, the way the message catalogue is (H-101, 0013), and for the
same reason: the registration is the decision, and writing one is not. Each action carries a label
and the module it belongs to, so the audit screen has something to display and something to group
by without a column on the table.

**A state change records one shape.** `changes({ field: [from, to] })` produces
`changes: { field: { from, to } }`, field by field, whatever endpoint wrote it (J-101 criterion 4).
A settings change whose value is sensitive still records a hash pair instead: that is a redaction
rather than a diff, and it keeps its own shape (0024).

**Every mutating route is answerable, and `check:audit` enforces it.**
`shared/utils/audit-coverage.ts` names each route under `server/api` and `server/routes` that
carries a mutating method, is a custom route, or already writes an entry, and says either which
actions it is responsible for or why it records nothing. The checker fails the build when a route
is missing from the registry, when it claims an action that neither it nor its named delegates
write, or when a registry entry names a file that no longer exists. That is J-101 criterion 5's
maintained fixture: a list that cannot rot, because the build reads it.

**An audit entry goes in the same batch as the change it records.** Batch is the only atomicity D1
gives us (0001, 0003). `openAttempt` and `mintRecoveryCodes` now take the entry as a required
argument rather than leaving the caller to insert it afterwards, so a writer that has to produce an
entry to call the function cannot forget one.

## Consequences

- A new module writing a new kind of entry adds a catalogue row and a coverage row. That is two
  lines and a decision about what the action is called, taken once, at the point somebody is
  already thinking about it.
- A route that genuinely records nothing states why, in the registry, where a reviewer can
  disagree with it. Five do today: signing out, an unconfirmed enrolment, and the three routes that
  issue a token and ask for a message, whose sends are recorded in `notification_log` instead.
- The checker greps for the action literal, so an action assembled at runtime from a variable would
  pass without writing what it claims. Every current site writes a literal or a ternary of
  literals; a future one that does not has to be exempt with a reason.
- `check:audit` joins lint, typecheck and the four existing checkers as a CI gate.
