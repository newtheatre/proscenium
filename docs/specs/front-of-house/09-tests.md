# 8. Tests

Tests use the stack Foundations proved: Vitest in workerd with a local D1 for services and routes, Playwright against the built Worker for journeys. Time is always injected; no test reads the real clock.

## The window and the facts

| Test | Checks |
| --- | --- |
| Window arithmetic | Call, end and both window times for a performance with and without a running time; the three-hour fallback; a manager's own call time |
| Edges | On-shift holds at exactly `window_opens_at` and `window_closes_at`, and not one second outside |
| States | Holds for confirmed, release\_requested, checked\_in; not for requested, declined, withdrawn, released, removed, worked, no\_show |
| Shift state | Does not hold on a draft or cancelled shift |
| Leading | Holds only on a lead duty; a person on a lead and a non-lead duty at one performance is leading |
| Rostered | Holds from request to window close; holds for a shift with no performance; never on-shift there |
| Resolver contract | Each fact answers holds, record and until; the resolver writes nothing |
| Extend tonight | Moves every shift of the performance; refuses past six hours; never moves earlier |
| Settings | Changing a window setting leaves existing shifts alone |
| Loss | A write made after the window closes is refused with `front-of-house.shift-ended` |
| Daylight saving | A shift across the clock change keeps its true length |

## Rota

| Test | Checks |
| --- | --- |
| Capacity under contention | Fifty concurrent sign-ups for three places yield three assignments and `places_taken` of three |
| Sign-up rules | Each refusal code is reached: full, closed, overlapping, not eligible |
| Eligibility | No requirement means eligible; an unmet one shows the provider's reason; unavailable is not enforced and the screen says so; a person with no account is unmet; a manager's override is audited |
| Release | Outside notice frees the place; inside keeps it; cover swaps both in one batch; a failed batch changes neither |
| Confirmation mode | Requested takes a place; decline frees it |
| Template | Applying twice is idempotent; an archived duty is skipped |
| Rescheduled and cancelled | Times recomputed by the same offsets; one notification per person; cancelled releases all |
| Reminders | Two at most; a re-run of the task sends none; zero turns one off |
| Merge | Two accounts on one shift merge into one assignment and `places_taken` drops by one |
| Hours | Scheduled and checked modes; a correction is audited |

## The night

| Test | Checks |
| --- | --- |
| Board | A slow or throwing figure contributor shows unavailable and does not delay the rest; a figure is hidden without its ability |
| Check-in | Refused before the window; allowed by self and by a lead; not by another steward |
| Timings | One per kind; replacing is audited; house open refused with open pre-show runs only when the setting is on |
| Checklist | Required items gate completion; exception needs a reason; state reflects exceptions; item label is copied |
| Offline queue | A replayed entry with the same idempotency key writes once; an entry after completion is refused and shown as stuck |
| Emergency card | Opens with the network off after one visit; review date changes only with the tick |

## Incidents

| Test | Checks |
| --- | --- |
| Severity floor | First aid or emergency services force at least moderate, at report and at review |
| Routing | Immediate at or above the setting; digest below; the notification body holds no free text |
| Visibility | The reporter sees only their limited view; an administrator without the ability sees nothing; each welfare read is audited |
| Closing | Needs note and no open action; reporter cannot close a serious one; a second person can |
| Numbering | Numbers are unique and gapless per year under concurrent reports |
| Events | `incident.reported` is internal and never reaches a webhook |
| Encryption | `details` is unreadable in the database file |

## The night report

| Test | Checks |
| --- | --- |
| Sign-off | One unit of work: assignments resolved, snapshot written, event announced; a failure leaves a draft |
| Snapshot | Contains no account id's name, no free text; a contributed section returning text is rejected |
| Immutability | Any update to a signed row but `distributed_at` fails at the database |
| Addendum | Allowed after sign-off; a note of kind note is not |
| Distribution | Goes to holders following the topic; off when the setting is off |

## Privacy

| Test | Checks |
| --- | --- |
| Schema check | Every column has a class and an erasure behaviour; the Foundations lint passes, including `unlinked` on incident people |
| Erasure | Assignments kept and redacted; incident people anonymised; welfare details cleared at once |
| Hold | An open incident holds an erasure; closing lifts it |
| Unlinked person | Found only by a holder of the redaction ability; the search is audited; redaction clears name, contact and details |
| Retention | The sweep removes what is past its period and nothing else; the child period applies when flagged |
| Export | A person's download holds their assignments and their own words, and no one else's details |

## Journeys in the browser

1. A manager applies a template, publishes, and a member signs up on a phone.
2. A volunteer releases inside the notice period and another takes the cover.
3. A steward's evening: the bar appears when the window opens, the board, a checklist with one exception done offline, check-in.
4. A lead's evening: timings, extend tonight, sign off, and the report arriving for a manager.
5. An incident reported offline by a steward, reviewed and closed by a welfare lead, with the reporter's view checked.
6. The window closing: the bar goes, and a queued act shows as stuck.

Each journey runs the automated accessibility check on every screen it visits, and the live-mode screens are also run at 320 pixels wide.

## What is not tested here

The figures themselves (Box office's and Payments' own tests), delivery of notifications (core's), and the bar and menu chrome (Interface's). Front of house tests its contributions against the points' contracts.
