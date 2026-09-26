# 0098: An officer's bypass is recorded when it acts, not when it looks

- Status: Proposed
- Date: 2026-09-26
- Amends: 0044

## Context

0044 lets the Front of House Manager and the Bar Manager open tonight's screens without a shift,
and records every such resolution as `night.officer-bypass`, once per account, night, venue and
role, so the night report shows the committee a rota that is not being kept. It records at
resolution, and resolution runs on every show-night request, reads included. The show-night
layout asks the server which of the three roles the viewer holds as soon as any screen mounts, and
fetches the emergency card beside it, so an officer who merely opens the hub writes a row for every
role they hold. The MVP flow review of 25 September 2026 (issue 1324) found the Front of House
Manager's door and duty manager rows written in the same second, and the night report then said an
officer had stood in above a duty manager who was confirmed and on shift. The report read the duty
manager's row alone, so a door or till bypass never reached it at all.

A row that records looking is noise over the one signal 0044 exists for: an officer standing in
because the rota failed. The check a screen makes to learn what its viewer may do cannot itself be
the record of having done it, and a report that flags one role of three is not a staffing record.

## Decision

**A read records nothing.** `requireNightAuthority` still resolves an officer on a `GET` or `HEAD`
request, with the same second-factor gate and the same refusals, and returns `via: 'OFFICER'`; it
writes no row. `GET /api/tonight/authority` is therefore the role check a screen may make as often
as it likes, and it is how the hub learns which tiles to show.

**An act records, exactly as 0044 says.** Every other method (admitting at the door, pricing or
selling at the till, ticking the checklist, logging an incident, resetting the board, closing the
night) records `night.officer-bypass` once per account, night, venue and role, under the same
partial unique index. The rule is the request's method, read by `bypassIsRecorded`, so a write
route added later records without anybody remembering to make it.

**One read is an act: tonight at a glance.** The glance shows the agreed door wording for tonight's
access bookings, which is the one show-night read of something only tonight's team may see. Its
route passes `recordsRead`, so an officer reading it is recorded as standing in.

**The night report flags every role an officer stood in for.** Its staffing section lists each
bypass recorded against the performance, in role order: the role, the officer's name, and whether
a confirmed shift of that role was on the performance anyway. The single flag read from the duty
manager's row is gone.

## Consequences

- An officer who opens the hub, reads the door list and leaves is not on the report. One who admits
  a single person at the door is, once, for the night; one who reads the glance is, for the duty
  manager's role.
- A new `GET` route that shows personal data only tonight's team may see must pass `recordsRead`.
  A reviewer who finds such a route without it has found a defect; one that reads counts or
  tonight's own programme needs nothing.
- "Beside a confirmed shift" is its own finding: an officer acting while the rota says somebody
  else holds the role is a question about the rota, and the report now says which it was.
- A report frozen before this record carries only the duty manager's flag, and the screen still
  shows it for such a report. Nothing already written is rewritten.
- E-111 criterion 4 and E-123 criterion 1 are amended to say so. E-131 criterion 5 is unchanged:
  the bypass still has no window and is still recorded once per night, venue and role.

## Options considered

- **Record on the first request of any kind, as 0044 did.** Rejected: it is what produced the false
  flags, and it made the report's staffing section unreadable on the nights it matters.
- **Record only on routes named by hand.** Rejected: a write route added later would silently
  record nothing. The method rule covers every write, and the one read that matters opts in.
- **Keep recording reads but move the layout's role check later.** Rejected: any screen that shows
  a tile per role still has to ask, and it would still write a row for roles nobody used.
