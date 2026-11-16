# 7. Stories

Spaces has 48 stories, SP-01 to SP-48: 4 gate, 32 in the rest of its first release and 12 later. Each cites the rules in part 3 it delivers, so a story is done when those rules' tests in part 8 pass.

|  | Gate | Rest of first release | Later | All |
| --- | --- | --- | --- | --- |
| Stories | 4 | 32 | 12 | 48 |

The gate is the proof that two people cannot hold the same room at once, across bookings and performances. Nothing else in the module is worth building until it passes.

## Gate

| Id | As | I want | So that | Rules | Rests on |
| --- | --- | --- | --- | --- | --- |
| SP-01 | a developer | the module, its seven tables, record types and abilities declared in the manifest | everything else has somewhere to stand | part 2, part 6 | The kit (F-01 to F-10) |
| SP-02 | a member | a confirmed booking to be mine alone | I never arrive to find the room taken | C1, C2 | SP-01 |
| SP-03 | an administrator | a performance or a closure to block the room for bookings | the programme always comes first | C1 items 2 and 3, C2 | SP-02; core's performances and closures (C-01 to C-18); its assertSpaceFree predicate (part 4) |
| SP-04 | a developer | every state move to be one guarded update with its history row and event | two people acting at once cannot both succeed | the moves table | SP-01 |

## Setting up

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| SP-05 | an administrator | to choose which spaces can be booked, from the setup step or the list | no room is bookable by surprise | part 2, bookables | First |
| SP-06 | an administrator | to set a bookable's weekly opening hours, or mark it always open | bookings stay inside the building's hours | P8 | First |
| SP-07 | an administrator | a starting list of purposes from my theatre type, which I can change | I do not start from a blank page | part 6, presets | First |
| SP-08 | an administrator | to set each purpose's tier, who it is open to and its limits | priority follows what a booking is for | P2, P5 to P7, L6 | First |
| SP-09 | an administrator | to switch a purpose off, or require approval for it, in one room | the workshop is not booked for socials | P3, A1 | First |
| SP-10 | an administrator | to add a resource such as a van or a piano | shared things have a diary too | part 2, bookables | First |
| SP-11 | an administrator | to mark a bookable as external, with who we ask | members can ask for rooms we do not control | E1, E3 | First |
| SP-12 | an administrator | to pause or archive a bookable | a room being refitted takes no new bookings | L4, L5 | First |
| SP-13 | an administrator | to see who can decide and who can book in each room, and be warned when nobody can decide | requests are never stuck | A2, the health check | First |

## Booking

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| SP-14 | a member | a calendar of the rooms I can book, by day, by week and as a list | I can see what is free | K1 to K3 | First |
| SP-15 | a member | to ask for a room, a time and a purpose, and be told at once whether it is confirmed, sent for a decision or refused, and why | I know where I stand | P1 to P9, A1, C3 | First |
| SP-16 | a member | the form to tell me the outcome before I submit, and offer the nearest free time | I do not submit to find out | `checkRequest`, C3 | First |
| SP-17 | a production team member | to book for my production with purposes only its team can use | rehearsal space goes to shows | P2 | First |
| SP-18 | a member | to see, change the details of, and cancel my bookings | my plans can change | X1, X4 | First |
| SP-19 | a member | to move a booking to another time or room without losing the old one until the new one is certain | I am never left with neither | X2, X3 | First |
| SP-20 | a member | to book a weekly or fortnightly series, see which dates clash, and leave those out | I book a term of rehearsals in one go | R1 to R5, R8 | First |
| SP-21 | a member | to change or cancel one occurrence, later ones, or all that are left | a series bends without breaking | R6, R7 | First |
| SP-22 | a member | a reminder before my booking | I turn up, or cancel in time | the reminder task | First |
| SP-23 | a room manager | to book on a member's behalf | someone without the app still gets a room | P11 | First |
| SP-24 | an administrator | to book outside the limits with a reason on record | the exception is possible and visible | P10 | First |

## Deciding

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| SP-25 | a room manager | one list of the requests I may decide, each with its clashes and the booker's record | I decide with everything in front of me | A2, A3 | First |
| SP-26 | a room manager | to confirm or decline with a note, and for the booker to be told | the answer and its reason reach them | A4, A5 | First |
| SP-27 | a room manager | to be told of a new request, and reminded once a day of those still waiting | nothing sits unseen | A5, A6 | First |
| SP-28 | a member | never to be able to decide my own request | approval means something | A2 | First |
| SP-29 | a room manager | to decide a whole series at once, or occurrence by occurrence | twelve dates are not twelve decisions | A7 | First |
| SP-30 | a room manager | to record that an external request has been placed, then the owner's answer and reference | members see "asked", then the outcome | E2 | First |
| SP-31 | a member | a request nobody decided in time to expire and tell me | I know to make other plans | A6 | First |

## Priority and change

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| SP-32 | a production team member | to ask for a time a lower-priority booking holds, for a room manager to decide | a dress rehearsal can displace a meeting, with notice and a person's judgement | B1, B2, B5, C5 | First |
| SP-33 | a bumped member | to be told at once, with the reason, who to talk to and a way to book again | being displaced is not also being ignored | B4 | First |
| SP-34 | an administrator | to see how many room bookings a new or moved performance, or a closure, will displace before I confirm, and for them to be bumped when I do | I act knowingly and the diary stays true | L1, L2, `core.change-impact` | First |
| SP-35 | a room manager | to mark a no-show, and see late cancellations and no-shows when deciding | patterns are visible | X4, X6, A3 | First |
| SP-36 | a member | my room bookings in my data download, and removed or anonymised if I am erased | my data rights hold here too | part 2, erasure | First |

## Later

| Id | As | I want | So that | Depends on |
| --- | --- | --- | --- | --- |
| SP-37 | a stage manager | a rehearsal call to make and own its room booking | the schedule and the diary cannot disagree | Production management; `requestBooking` with an origin is built in the first release and unused until then |
| SP-38 | an administrator | extra questions on the request form for a purpose | a workshop request says what tools are needed | Form builder's first release (phase 4); the form slot, open with Form builder (part 4) |
| SP-39 | a training lead | a room to need an induction before it can be booked | the workshop is used safely | Training. The requirements check (rule P13) is built in the first release with SP-15, and is not enforced while no module can judge the requirement |
| SP-40 | a member | a private calendar feed of my bookings | they appear in my own calendar | A token scheme for feeds, shared with core's `/whats-on.ics` |
| SP-41 | an administrator | a resource with a quantity, such as six radios | I book three of them | Question 7 |
| SP-42 | an administrator | rooms that combine or divide | booking the whole hall blocks both halves | Question 7 |
| SP-43 | a member of the public | to ask to hire a room, with a price and a deposit | the theatre earns from its spaces | Form builder, Payments, Finance; question 6 |
| SP-44 | a committee member | occupancy by room, purpose and week, and a no-show rate | we know how the building is used | Reports |
| SP-45 | a member | to be offered a time when a booking that blocked me is cancelled | freed time is used | Question 4 |
| SP-46 | an administrator | setup and clear-down time added around bookings in a room | the next group is not waiting in the corridor | none |
| SP-47 | an administrator | a weekly limit on hours per person or per production | no one show takes the building | none |
| SP-48 | a duty manager | "what is in each room now" on the live screen | I can find people in an emergency | Front of house, Interface's live mode |

## Order of work

1. **Gate:** SP-01, SP-04, SP-02, SP-03. SP-03 rests on core's assertSpaceFree predicate; SP-02 can be proved without it.
2. **Setup:** SP-05 to SP-10, SP-12, SP-13.
3. **Booking without approval:** SP-14 to SP-18, SP-22 to SP-24. At this point a theatre that approves nothing has a working module.
4. **Approval:** SP-25 to SP-28, SP-31, then SP-11 and SP-30.
5. **Series:** SP-20, SP-21, SP-29.
6. **Change and priority:** SP-19, SP-32 to SP-36.

If the release has to shrink, cut from the end: priority bumping by request (SP-32) goes first, with bumping by performances and closures (SP-34) kept; then series; then external bookables.
