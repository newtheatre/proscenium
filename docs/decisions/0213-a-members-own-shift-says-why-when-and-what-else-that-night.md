# 0213: A member's own shift says why, when, and what else that night

- Status: Proposed
- Date: 2026-10-21
- Amends: E-114 (dismissing a declined claim), E-107 criterion 1 (withdrawing a claim), K-127
  (the Next shift tile)

## Context

The hands-on run of 21 October 2026 found that a volunteer's **Declined** card did not show the
officer's reason, only the email did; **Dismiss** gave no feedback and did not say it put the shift
back on offer; a waiting claim offered **Release the shift**, as if it had been confirmed; and the
My NNT tile gave the curtain (21:30) for a shift starting at 20:30, and showed one of two shifts
the volunteer held that night. "See open shifts" was offered to members who could claim nothing.

## Decision

- **A declined card shows the reason**, read from the member's own row (`declineReason` on
  `/api/rota/mine`), and says what Dismiss does. Dismiss confirms with a toast.
- **A waiting claim offers Withdraw my claim**, with its own dialogue and toast. The route is still
  the release, so nothing on the server changes.
- **The Next shift tile gives the shift's hours** from its own window (0078), and "and N more
  shifts that night" when there are others that show night, declined ones aside.
- **The empty line reads "See shifts and what opens them"**, since Rota also carries the cards
  that say what training would open a role.

## Consequences

- `/api/rota/mine` returns `declineReason`, the member's own; no officer field is added.
- `/api/my/summary` carries `windowStartsAt`, `windowEndsAt` and `moreThatNight` on its shift.
