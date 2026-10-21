# 0119: A console screen whose read did not finish shows only why, in place of its work

- Status: Proposed
- Date: 2026-10-14

## Context

Console lists showed a refused or failed read as an alert above the screen they would have drawn:
the toolbar, an empty table and a live create button. A manager whose authenticator had lapsed
opened Shows and read "0 shows" beside "Add a show", which is an invitation to recreate the
programme; some empty states repeated the refusal as their own text, so it appeared twice (hands-on
review, 13 October 2026). K-127 criterion 7 already says this for the member's screens, and K-123
holds the console's shared conventions, but no shared piece enforced it, so each of about sixty
screens did it its own way or not at all.

Several screens also turned a `useAsyncData` error into their alert with a plain `watch`, which
never fires for an error the server render already raised, so the server-rendered page showed the
empty list with no alert at all.

## Decision

A console screen draws its work inside `ReadGate` (`app/components/ReadGate.vue`), given the
failure of the read the screen is about. While that read has failed, the gate draws `ReadFailure`
and nothing else: no toolbar, no table, no empty state, no create button. A failure is a
`ListFailure` from `useListFailure` (or `listFailureFrom` for a screen's own `try`), which now
carries the response status.

- A dropped or failed read offers Try again; a refusal (403) does not, since asking again cannot
  mend it, and offers the way through instead when there is one, such as setting up an
  authenticator app.
- A question the route rejected (400 or 422, a bad period or filter) keeps the screen's controls
  under the alert, so the reader can change what they asked.
- A screen keeps the failure of its read apart from a write's refusal: a refused save leaves the
  list in view with its own alert, as before.
- `tests/unit/console-read-gate.test.ts` fails when a console screen does not use the gate. Its
  short exemption list names the screens whose work is not one read: a redirect, two forms, and
  the overview and reports, whose sections each say their own failure in their place.

## Consequences

Every console list behaves the same on a refusal, and the authenticator wall reaches every screen
with its enrol link through one component. A screen added later is held to it by the test.

The cost is one wrapper element per screen and a second failure ref on screens that also write.
A screen whose read lives in a component it draws (the training catalogue) is gated in that
component, which the test also checks.

## Options considered

- Disabling the create buttons while the read is failed: each screen would need to know which of
  its buttons create, and the empty table would still promise there is nothing.
- Only removing the refusal from the empty state: leaves "Add a show" live under "0 shows".
