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

Training is checked where a shift is claimed or assigned (E-104, E-107, issue 1302), never again at
the door on the night: a confirmed door shift opens the door with no training read. A live
door-eligibility check on the duty manager at the moment of cover would put a second training gate
on the night that no other shift has, and would refuse a duty manager at 19:20 over a record the
claim already weighed.

## Decision

**DOOR authority also resolves on a confirmed DUTY_MANAGER shift on the same performance, inside
that shift's own window (0078).** It is tried after every role's own shift and before any officer
bypass, so a screen several roles reach resolves a duty manager as the duty manager, and it
resolves with `via: 'COVER'`. It opens the door and pass admission for that performance and no
other; it never opens the till, which stays with the bar (E-111 criterion 1).

**Cover is recorded once, when the duty manager acts.** The first act at the door writes
`night.door-cover` once per duty manager, night and venue, the row's detail carrying the duty
manager's own performances at the venue that night, and a read records nothing (0098). The write
is an insert whose "not already written" predicate rides the statement, so two first acts at once
write one row (0003). The night report's staffing section names who covered the door, on each
performance the row names.

**The catalogue carries the training, not a live check.** The duty manager shift's module
(`SHIFT_ELIGIBILITY_DUTY_MANAGER_MODULE`, Committee Operations and Governance) requires the door
shift's module (`SHIFT_ELIGIBILITY_DOOR_MODULE`, Box Office and Ticketing) in the catalogue, so
whoever claimed the duty manager shift was trained on the door. That is committee configuration in
the training console, not code.

**A door refusal points to tonight's duty manager.** Somebody refused at the door is told that
tonight's confirmed duty manager can open it, where one is confirmed for the performance. Anyone
signed in can be refused at the door, so the first name goes only to somebody holding a confirmed
shift on that performance; anybody else reads "tonight's duty manager".

## Consequences

- E-111 criterion 1 is amended to say a confirmed duty manager shift also opens the door for its own
  performance and window.
- The night report gains a cover line beside the officer bypass lines. Cover is not a bypass: it is
  a shift, and the season report's officer-bypass column does not count it.
- `NightAuthorityVia` gains `COVER`. A screen that asks whether an officer stood in reads
  `OFFICER` and is unaffected.
- The duty manager's name is read on a door refusal, one bounded query on a refusal path only.
- The duty manager module's prerequisite is a Training Manager task before 12 October, recorded in
  `docs/workshops.md`. Until it is set, a duty manager may cover the door without door training.

## Options considered

- **Status quo: the duty manager phones the Front of House Manager.** Rejected: the night stops for
  a phone call on the evenings the door is short.
- **A second, door shift for the duty manager.** Rejected: E-104 criterion 3 forbids it, and the rota
  would show two jobs for one person.
- **The duty manager assigns a present volunteer from the phone.** Deferred to V2 (E-206): it is the
  better fix when somebody is there to assign, and does not help when nobody is.
- **A live door-eligibility check on cover.** Rejected: training is checked at the claim for every
  shift, and a second gate on the night would refuse a duty manager the claim already admitted.
