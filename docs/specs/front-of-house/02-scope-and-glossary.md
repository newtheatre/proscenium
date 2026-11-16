# 1. Scope and glossary

Front of house (`front-of-house`) is a switchable module that requires only the core. It plans who works each performance, gives those people authority for that night and no longer, and leaves a signed record of the night behind.

## In scope

| Area | What it covers | Release |
| --- | --- | --- |
| Duties and rota templates | The kinds of job on a night (duty manager, steward, box office, bar) and the usual set for a performance | First |
| Rota | Shifts per performance, published for sign-up or filled by a manager | First |
| Shifts for the volunteer | Sign-up, confirmation, reminders, release and cover, on a phone | First |
| The shift window and the facts | When a shift confers authority, and on what | First |
| Tonight board | The duty manager's live screen: who is on, what is sold, what is outstanding | First |
| Checklists | Pre-show and post-show lists with exceptions and reasons, working offline | First |
| Incidents | An incident and near-miss log, routed by severity, with follow-up actions | First |
| Night report | Compiles itself, is signed off by the person leading, and is sent round | First |
| Volunteer hours | Hours counted from worked shifts, with an export | First |
| Emergency card | One card per venue, readable offline | First |
| Shifts not tied to a performance | A get-in, a social, a bar opening | First, without on-shift authority (question 8) |
| Backstage board | The half, the quarter, beginners, shown to the company | Later (question 7) |
| Duty-level authority | A duty that carries its own list of abilities | Later (question 2) |
| Availability and automatic rota filling | People say when they are free; the system proposes a rota | Later |

## Out of scope, and who owns it

| Not here | Owner |
| --- | --- |
| Whether a person is trained for a duty | Training, through the core point `core.requirement` |
| Scanning tickets, the door list, sold and admitted counts | Box office; front of house shows its figures and never counts tickets itself |
| Till sessions, takings and reader reconciliation | Payments and Bar, as sections they contribute to the night report |
| The Tonight hub, the on-shift bar, live mode's frame and offline queue | Interface (in `core`); front of house supplies the answer they read and the tiles they show |
| Who holds a role, and which abilities a fact gives | Identity; front of house declares facts and suggests a mapping |
| Performances, venues and spaces | Core domain |
| Room bookings for a get-in or rehearsal | Spaces |
| Paid staff: contracts, pay, working-time rules | Nothing. The module records hours; it is not a payroll system |
| A show report on the performance itself (artistic notes, the running of the show) | Production management, later. The night report is about the building and the audience |

## Principles

1. **Authority follows the rota.** Nobody is handed a role to work one night. A confirmed shift gives what the night needs, for that performance, and takes it away when the window closes.
2. **One answer to "is this person on shift".** Every screen and every module reads the same fact, computed from stored times, so two screens cannot disagree.
3. **A phone in a dim foyer.** Everything done on the night is a live-mode screen: large targets, one job each, working without a connection.
4. **An exception is recorded, never blocked.** A checklist item that cannot be done takes a reason and the night goes on. Only a theatre that asks for it gets a hard stop.
5. **The record of the night is fixed once signed.** Later corrections are added beside it and never rewrite it.
6. **Welfare detail stays narrow.** Who was hurt and how is seen by the few people who review incidents, is encrypted at rest, and never travels in an email, an event or a webhook.

## Glossary

Words this module owns. Words owned elsewhere are used as ruled in the paper's shared glossary.

| Term | Meaning |
| --- | --- |
| Duty | A kind of job on a night, defined by the theatre: duty manager, steward, bar. Never called a "role", which is Identity's word |
| Lead duty | A duty marked as the one that runs the night. Whoever holds it is "leading" |
| Rota | The shifts for a performance or a period, with who is on each |
| Rota template | A named set of duties and place counts applied to a performance to make its shifts. Always qualified, because "template" alone is ambiguous across modules |
| Shift | One duty at one performance (or one other occasion), with a number of places, a call time and an end time |
| Place | One person's worth of a shift. A shift with three places wants three people |
| Assignment | One person on one shift, with a state. "Shift" is the job; "assignment" is a person doing it |
| Sign-up | A person taking a place themselves |
| Confirmed | An assignment the theatre has accepted. Only a confirmed assignment gives authority |
| Release | A confirmed person handing their place back |
| Cover | Someone else taking a released place |
| Call time | When the person is expected to arrive |
| Shift window | The period in which a confirmed assignment confers the on-shift fact: from a little before the call time to a little after the end |
| On shift | Holding the fact `front-of-house.on-shift` for a performance, now |
| Leading | Holding `front-of-house.leading-shift`: on shift in a lead duty |
| Rostered | Having an assignment that has not finished. Opens the members' area and nothing else |
| Check-in | Recording that a person has arrived |
| No-show | A confirmed person who did not work the shift |
| Tonight board | Front of house's live screen for the person leading. Distinct from Interface's Tonight hub, which is the page of tiles everyone on shift sees |
| Checklist | A named list of items for a moment of the night: before the house opens, after it clears |
| Checklist run | One use of a checklist on one night |
| Exception | A checklist item not done, with its reason |
| Incident | Something that harmed or could have harmed a person or the building |
| Near miss | An incident in which nobody was hurt and nothing was damaged |
| Severity | Minor, moderate or serious. Decides who is told and how fast |
| Follow-up action | A task arising from an incident, with an owner and a date |
| Timing | A recorded moment of the night: house open, curtain up, interval, curtain down, house clear |
| Night report | The record of one performance from the building's side, compiled from what happened and signed off |
| Sign-off | The act that fixes a night report |
| Addendum | A dated note added to a signed report |
| Emergency card | A venue's evacuation and emergency instructions, kept on the device |

Two words need care across modules. **"Tonight"** alone means Interface's hub; this module's screen is always "the Tonight board". **"Template"** is always "rota template" here, beside the form template and the notification template.
