# 8. Test plan

Forty-four named cases must never regress: 6 for the gate proof, 10 unit, 24 integration and 4 end-to-end. They run on CI only, against D1 through Miniflare, as the repository's rules require. Each names the rules it guards.

## The gate proof: a call and its room never disagree

Run before anything else is built, against Spaces' real services (or its gate build), in the same harness as Spaces' clash proof.

| Case | Setup | Must hold | Rules |
| --- | --- | --- | --- |
| G-1 together | Save a call in a free room | One call row and one Confirmed or Requested room booking with origin `rehearsals.call` and the call's id, written in one unit | B1 |
| G-2 refused together | Save a call in a room already Confirmed for that time | No call row, no room booking; the refusal carries Spaces' code and nearest free time | B1, C6 |
| G-3 race | Two managers of two productions save calls in the same room and time at once | Exactly one call exists with a room; the other save is refused whole | B1; Spaces' C2 |
| G-4 move | Move a call to a free time, then to a taken one | First: booking moved in the same unit. Second: refused, call and booking unchanged | B2 |
| G-5 cancel and delete | Cancel a published call; delete a draft | Each room booking is Cancelled in the same unit; no orphaned booking remains | B3 |
| G-6 lost room | Spaces bumps the booking (a performance scheduled over it); deliver the event twice | `room_state` is `lost` with reason `bumped`, managers told once, people called told nothing | B4, B5 |

## Unit

| Case | Must hold | Rules |
| --- | --- | --- |
| U-4 own call time | A running order 19:00 1.1, 19:45 1.2, 20:30 1.3 calls a person in 1.2 only from 19:45 to 20:30 | U4 |
| U-5 what is a change | Changing notes raises the version but makes no notice; changing a person's own time makes a notice for that person only | N1, N2 |
| U-6 coalescing | Three edits within the coalesce window produce one notice per affected person | N2 |
| U-7 short notice | A change 20 hours before the call, with short notice 24h, is marked urgent | N3 |
| U-8 warnings never refuse | A call against stated busy time, another commitment, the daily-hours limit and the latest end saves, with four warnings | W1 to W5 |
| U-10 room state mapping | Each Spaces event maps to the right `room_state`; an event for a booking with another origin, or none, changes nothing | B4 |
| U-12 availability levels | One levels() call covers the team for the week shown; busy over a person's own call time gives W2 and sets clash, maybe gives a note without clash, unknown gives nothing; a busy block ending 19:30 reads "late until 19:30" against a 19:00 call | F2, W2 |
| U-13 attendance window | Marks are accepted from the call's start until 7 days after its end and refused outside it; an unmarked person stays unmarked; the first mark sets attendance_taken | A4 |
| U-14 attendance off | With rehearsals.attendance.enabled at its default, off, no attendance control shows and a mark is refused; switched on, both work | A3 |
| U-11 under 18 | With ageStatus answering under-18 for one person called and unknown for another, only the first is marked, the marker reaches only people who run calls and no export; W7 fires only once its setting is set and the call ends after it; the call saves either way | W6, W7 |

## Integration

| Case | Must hold | Rules |
| --- | --- | --- |
| I-1 only the team | Calling an account not in `listTeam` is refused with `rehearsals.not-on-team`; calling a merged alias of a team member is allowed and shown once | C5, U2 |
| I-2 units call people | Adding unit 1.2 calls its three people; removing it before publishing removes them; removing it after publishing asks first | U1 |
| I-3 unit changes | Adding a person to a unit adds them to its draft calls only; published calls are listed for the manager | U5 |
| I-4 issuing a sheet | A week with four drafts and two published calls: the four publish in one unit, each person gets one message listing only their own calls, the sheet records 4 and the number told | S1, S2 |
| I-5 one-call publish | Publishing a single draft tells its people about that call alone | S4 |
| I-6 change notices | Moving a published call tells everyone called; changing one person's time tells that person; adding and removing people tells only them | N1, N2 |
| I-7 cancellation | Cancelling a published call needs a note, tells everyone called, and cancels the room booking | moves table, B3 |
| I-8 room needs approval | In the `student-society` preset, a call in a room saves with `room_state` requested; Spaces' approval later sets it confirmed | B1, B4 |
| I-9 change needing approval | Moving a call whose new time needs approval: the old booking stays Confirmed until the new is confirmed, then is cancelled | B2 |
| I-10 still unconfirmed | A published call 40 hours away with its room requested is flagged and its managers reminded once | B6 |
| I-11 leaving the team | Productions' left event with a future leaving date removes the person from drafts and later published calls, with one notice, and keeps past calls | U3 |
| I-12 production cancelled | Every future call is cancelled in one set with its room booking, and each person called is told once | L1 |
| I-13 who sees what | A team member sees published calls only; under `own` they see only their own; drafts and private notes need `schedule.view` | V1 to V3 |
| I-14 own rows without an ability | A cast member with no grant can see their own calls and respond, and cannot see anyone else's response | V1 |
| I-15 person-busy | `personsBusy` for three accounts returns Rehearsals' published calls as firm, nothing for drafts, nothing about other accounts; account ids reach the contributor by subquery or in chunks of 90 | F3; C-66 |
| I-16 the calendar feed | The contribution to core.calendar-feed for an account lists only that person's published calls, with their own times, and marks a cancelled call; drafts never appear | V4 |
| I-17 erasure | Erasing a cast member removes future call rows, anonymises past rows and keeps the call counts | part 2 |
| I-18 milestones | Publishing a technical call announces `rehearsals.call.published` with kind `technical`; cancelling it announces `cancelled` | part 4 |
| I-19 availability request | Asking the team opens one Availability request with sourceRef rehearsals.schedule:\<id>; closing the schedule closes it; a team member can still enter availability after it closes | F1, L5 |
| I-20 one report per call | A report can be started only once the call has started, and a second report for the same call is refused; each note names a core.department term | R1 |
| I-21 sending a report | Sending marks it sent and gives each recipient chosen by rehearsals.reports.send-to one message with the whole report; a department's actions reach its lead's home card, or the production's leads when it has no lead | R2 |
| I-22 after sending | The summary and sent notes cannot be edited; a new note is marked added_after_send and sent to the same recipients as a short addition; an action can be ticked by its department or a manager only | R3 |
| I-23 attendance changes nothing else | Marking someone absent changes no role, grant, eligibility or Productions fact; erasing them anonymises their marks and keeps the call's counts | A5, part 2 |
| I-24 per-person hours | rehearsals.person-hours-attended sums only calls marked present or late; with attendance off it returns no rows; a read without rehearsals.person-hours.read is refused, and Reports' read writes a read audit row with its purpose key | A5, RH-51 (R3-27) |

## End-to-end

| Case | Journey | Rules |
| --- | --- | --- |
| E-1 a week of rehearsals | A stage manager breaks the script into units, asks for availability, a cast member gives theirs in Availability, the manager makes three calls (one with a warning), issues the sheet; the cast member sees their own times on a phone | Gate, U1, F1, W2, S1, V1 |
| E-2 the room goes | A room manager declines a call's room request; the planner shows Room lost; the manager picks another room; the cast are not told until the call is changed | B4, B5 |
| E-3 last-minute change | A call is moved four hours before it starts; the people affected get an urgent email and see "Changed" on My rehearsals | N2, N3 |
| E-4 keyboard and screen reader | The planner, call editor and breakdown grid can be used by keyboard alone, and each block and tick is read with its full label | part 5, accessibility |

## Not tested here

- Spaces' own rules (clash, approval, bumping): Spaces' tests. Rehearsals tests only that it calls them in its unit and copies their answer.
- The Calendar component: Interface's UI-35 tests.
- `core.person-busy` itself: Festival-ready's C-66 tests; I-15 tests only Rehearsals' contribution.
- Availability's own rules (entering availability, reasons and their sharing, retention, erasure): its T-AV tests, which took over this spec's former U-1 to U-3 and U-9. U-12 and I-19 test only Rehearsals' use of it.
