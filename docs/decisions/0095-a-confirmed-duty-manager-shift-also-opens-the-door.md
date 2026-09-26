# 0095: A confirmed duty-manager shift also opens the door

- Status: Proposed
- Date: 2026-09-26
- Amends: 0044

## Context

Show-night authority derives from tonight's confirmed shift, role by role: a door shift opens the
door, a bar shift the till, a duty manager shift the duty manager's screens (0044, E-111 criterion
1). The MVP flow review of 25 September 2026 (issue 1306) found Rowan, tonight's confirmed duty
manager, refused at `/tonight/door` and in pass mode. The duty manager cannot take a second shift
(E-104 criterion 3) or assign one (that is `rota.write`, a console permission), so when the door is
short the only way in was phoning the Front of House Manager for their bypass. The person running
the night could not do the one job every front of house volunteer can.

A live door-eligibility check on the duty manager was considered and set aside:
`SHIFT_ELIGIBILITY_DOOR_MODULE` ships unset until the committee names it (issue 1318), and an unset
rule refuses everyone (E-103 criterion 4), so the check would refuse every duty manager on the very
nights this exists for.

## Decision

**DOOR authority also resolves on a confirmed DUTY_MANAGER shift on the same performance, inside
that shift's own window (0078).** It is tried after a door shift and before the officer bypass,
and resolves with `via: 'COVER'`. It opens the door and pass admission for that performance and no
other; it never opens the till, which stays with the bar (E-111 criterion 1).

**Cover is recorded once, when the duty manager acts.** The first act at the door writes
`night.door-cover` once per duty manager, night and venue, the row's detail carrying the venue's
performances, and a read records nothing (0098). The write is an insert whose "not already
written" predicate rides the statement, so two first acts at once write one row (0003). The night
report's staffing section names who covered the door.

**The catalogue carries the training, not a live check.** The duty manager module requires the door
module in the catalogue, so whoever holds a current duty manager record has been trained on the
door. That is committee configuration in the training console, not code.

**A door refusal names tonight's duty manager.** Somebody refused at the door is told, by first name,
that tonight's confirmed duty manager can open it, where one is confirmed for the performance.

## Consequences

- E-111 criterion 1 is amended to say a confirmed duty manager shift also opens the door for its own
  performance and window.
- The night report gains a cover line beside the officer bypass lines. Cover is not a bypass: it is
  a shift, and the season report's officer-bypass column does not count it.
- `NightAuthorityVia` gains `COVER`. A screen that asks whether an officer stood in reads
  `OFFICER` and is unaffected.
- The duty manager's name is read on a door refusal, one bounded query on a refusal path only.
- The duty manager module's prerequisite is a Training Manager task before 12 October, recorded in
  `docs/workshops.md`.

## Options considered

- **Status quo: the duty manager phones the Front of House Manager.** Rejected: the night stops for
  a phone call on the evenings the door is short.
- **A second, door shift for the duty manager.** Rejected: E-104 criterion 3 forbids it, and the rota
  would show two jobs for one person.
- **The duty manager assigns a present volunteer from the phone.** Deferred to V2 (E-206): it is the
  better fix when somebody is there to assign, and does not help when nobody is.
- **A live door-eligibility check on cover.** Rejected while the key ships unset, since it would
  refuse every duty manager.
