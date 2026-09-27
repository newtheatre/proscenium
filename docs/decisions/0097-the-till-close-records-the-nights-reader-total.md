# 0097: The till close records the night's reader total

- Status: Accepted (IT Manager, 26 September 2026)
- Date: 2026-09-26
- Extends: 0009 (who writes the night's reading) and 0005 (the one SumUp reader)

## Context

A show night has one SumUp reader and one login, shared by the desk and the bar (the IT
Manager, 26 September 2026). Since issue 1308 the till close already asks for that reader's Z
and compares it with the whole night, desk included (F-118 criterion 1). The Treasurer then read
the same Z off the same reader the next day and typed it again on Daily reconciliation (I-104
criterion 2), and the bar's note on a difference reached no money screen (issue 1309, from the
MVP flow review of 25 September 2026). One physical reading was typed by two people, a day
apart, and the explanation written by the person who stood at the reader was lost on the way.

I-104 criterion 2 names "an authorised person" entering the reading. Until now that meant
`finance.write`, a standing officer permission. The person closing the till holds tonight's bar
authority instead: a confirmed bar shift, or the Bar Manager's role (0009, 0044).

## Decision

The till close records the night's reading. In the same batch as the close, and only when that
caller's close is the one that landed, it inserts a `z_readings` row for the session's night:
the Z the closer keyed as the reader figure, the whole-night expected figure the close stamped,
their difference, the close's note, and the closer as the person who entered it. The row names
the session in `till_session_id`.

- If the night has no reading yet, the close's row is its first.
- If the night's live reading was itself recorded by a till close, the new close supersedes it.
  One reader serves every bar, so a later close reads a fuller total than an earlier one, and
  the latest close is the night's reading.
- If the night's live reading is finance's own (a first reading, a correction or a write-off
  typed on Daily reconciliation), the close records nothing there and finance's reading stands.
  The close still happens, and its own figures stay on the session.

Correction and write-off stay with `finance.write`: the Treasurer resolves a difference by
superseding the till's reading exactly as before. A night no till closed, the desk alone on a
quiet day, is still read and recorded by hand.

## Consequences

- The Treasurer types a Z only for a night no till closed, or to correct one. A night the bar
  closed with the reader agreeing arrives reconciled.
- The closer's note is the reading's note, so it shows on Daily reconciliation beside who entered
  it, and a difference arrives with its explanation.
- Tonight's bar authority now writes one row of the reconciliation record. It writes nothing the
  close did not already record on the session, and it can never supersede finance's own reading,
  so derived authority adds no power over the Treasurer's work (0009).
- `z_readings.till_session_id` is a nullable column with no foreign key: adding one would rebuild
  the append-only table (0010). It is how a close tells a till's reading from finance's.
- The rule rides the insert as a predicate, not a read before the write, so two bars closing at
  once each see the other's committed row (0001, 0003).

## Options considered

- **Two readings a night, one from the till and one from the Treasurer.** Rejected: one reader
  has one Z, and two rows for one figure would each need resolving.
- **The night report's sign-off records the Z.** Rejected: the duty manager signing off does not
  hold the reader, and the bar close already asks for the figure.
- **A separate close for the desk.** Rejected: the desk has no session, and the till close already
  compares the whole night.
- **The close supersedes whatever reading is live.** Rejected: a stale session closed days later
  would overwrite the Treasurer's correction or write-off.
