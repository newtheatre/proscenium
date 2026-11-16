# 8. Tests

Spaces is tested in the three tiers Foundations fixed: unit tests for pure rules, integration tests against a local D1 in workerd, and end-to-end tests in a browser. One proof comes before any other work: that overlapping bookings cannot both be confirmed.

## The proof to run first

**Claim.** Rule C2: of any number of attempts to confirm overlapping times in one bookable, exactly one succeeds, whether each is a new booking, a decision on a request, or a move of an existing booking.

**Method.** The same shape as Box office's last-seat proof, whose scripts are in the project files under `box-office-proof/`. A small Worker with the `spaces_bookings` table and the three confirming statements; a runner that fires overlapping attempts at once.

| Run | Attempts | Pass when |
| --- | --- | --- |
| P-1 | 50 identical new bookings for one window | 1 Confirmed, 49 refused `spaces.clash`, no error of any other kind |
| P-2 | 50 new bookings, each overlapping its neighbour by one slot | No two Confirmed bookings overlap; at least 25 are Confirmed |
| P-3 | 20 requests for one window, all decided "confirm" at once | 1 Confirmed, 19 still Requested, each decider told of the clash |
| P-4 | A booking moved into a window while another is made there | Exactly one holds the window; the moved booking, if it lost, still holds its old time |
| P-5 | Back-to-back windows: 14:00 to 15:00 and 15:00 to 16:00, at once | Both Confirmed |
| P-6 | A series of 12 saved while one of its dates is taken by another request | The series is refused whole, or saved whole; never 11 of 12 without the booker choosing |
| P-7 | A booking made while a performance is scheduled into the same space and time | Never both left standing: either the booking is refused, or it is Bumped by rule L1 within one event delivery |

P-1 to P-6 are run locally and then against a deployed D1, as Box office's was. P-7 rests on core's `assertSpaceFree` predicate on the booking's own statement: a booking made over a scheduled performance is refused, and a performance scheduled a moment after a booking is confirmed bumps it. The result is recorded in this tab, dated.

**Not yet run.** This part specifies the proof; no code exists.

## Unit tests

Pure functions, no database.

| Area | Cases |
| --- | --- |
| Overlap | Touching ends do not overlap; one inside another does; equal windows do; a zero-length window is invalid |
| Slot boundaries | Each slot size; a time off the boundary is refused; times across midnight |
| Limits fallback | Bookable, then purpose, then setting, for length; purpose then setting for ahead and notice; null at every level |
| Opening hours | Inside; straddling close; across midnight with a second row; always open; no rows; a day the clocks change |
| Purpose access | Each `open_to` value against a member, a team member of this production, of another production, and staff |
| Approval needed | Every clause of A1 alone and together; the bookable override in both directions |
| Bump eligibility | Higher, equal and lower tier; `can_be_bumped` false; inside and outside the notice; bumping switched off |
| Requirements | None listed; all met; one unmet refuses with its reason; unavailable is not enforced; bookable and purpose lists combined; checked at the start time, not now; an override is audited |
| Series expansion | Weekly on several days; fortnightly; monthly by weekday with a skipped month; count turned into a last date; the maximum; across both clock changes in Europe/London, with 19:00 staying 19:00; a start time that does not exist |
| State moves | Every pair of states: the allowed moves succeed and every other pair is refused |
| Calendar shaping | Each `show-details` value for the owner, another member, an approver; notes never leave for a plain member |
| Nearest free time | Before, after, none that day, with opening hours in the way |

## Integration tests

Against local D1, through the routes, with the clock replaced.

| Id | Scenario | Expect | Rules |
| --- | --- | --- | --- |
| I-01 | A member books a free time for an automatic purpose | Confirmed; one history row; one event; no notification | P1 to C1 |
| I-02 | The same for a purpose needing approval | Requested; approvers notified once through `notifyHolders` | A1, A5 |
| I-03 | Each of P1 to P8 broken in turn | Refused with that rule's code; nothing written | P1 to P8 |
| I-04 | An override with a reason, and one without | Confirmed and audited; refused | P10 |
| I-05 | A booking over a scheduled performance, a venue closure, a theatre-wide closure, a public holiday | Refused, refused, refused, allowed | C1 |
| I-06 | Two requests for one time; the first is confirmed, then the second | The second confirm is refused with the first named | C4, A4 |
| I-07 | A person with the deciding role decides a request that is for them | Refused | A2 |
| I-08 | Decline with no note | Refused | A4 |
| I-09 | A tier 3 request over a tier 5 booking 72 hours away; then one 24 hours away | Stored with `bumps`; on confirm the old booking is Bumped and its booker notified. The second is refused at asking | B1, B2, B4, C5 |
| I-10 | Confirming a bumping request after a performance has appeared in the window | Nothing written; the approver is told | B2 |
| I-11 | A performance is scheduled over two bookings and a request | Both Bumped with reason `performance`, the request Declined, three notifications, `core.change-impact` gave "2 bookings and 1 request" beforehand | L1 |
| I-12 | The same listener delivered twice | No second history row or notification | listeners |
| I-13 | A closure created over a resource's home venue | The resource's bookings are Bumped | L2 |
| I-14 | A space is archived | Bookable archived; future bookings Cancelled; past untouched | L4 |
| I-15 | A change of time that needs approval, then declined | The original booking never left Confirmed | X3 |
| I-16 | A change of time that needs none, into a taken time | Refused; the booking keeps its old time | X2 |
| I-17 | Cancel outside and inside the notice | `late_cancel` false, then true; the time is free at once | X4 |
| I-18 | A series of 12 with 2 clashing dates, left out | 10 bookings, one series, one summary message | R1, R4 |
| I-19 | "This and later" cancelled from the fifth of ten | Four stand, six Cancelled, the series still Active | R6 |
| I-20 | A series decided once | Every Requested occurrence Confirmed; one clashing occurrence reported and left Requested | A7 |
| I-21 | An external bookable: asked, marked as placed, confirmed with a reference | Requested throughout until the answer; the booker sees "asked" | E1, E2 |
| I-22 | The sweep with a past confirmed booking, a past request and a spent series, run twice | Completed, Expired, Ended; the second run changes nothing | sweeps |
| I-23 | Reminder due, task run twice | One message | sweeps |
| I-24 | Another module calls `requestBooking` with an origin, then fails its own write | No booking exists | services |
| I-25 | `cancelBookingsOfOrigin` | Cancelled with reason `origin-removed` | L8 |
| I-26 | Erasure of a person with past and future bookings | Future ones Cancelled and their times free; past ones anonymised with title and notes redacted; occupancy counts unchanged | part 2 |
| I-27 | Two accounts merged | Every booking, decision and history actor now names the survivor | part 2 |
| I-28 | The calendar route for a plain member under each `show-details` value | No field beyond what K2 allows is in the response body | K2 |
| I-29 | Every route without sign-in, and as an audience-side account | Not found | K4 |
| I-30 | The module switched off | Routes answer 404; core's `isSpaceFree` ignores bookings; tables intact; switching back on shows the same bookings | L9 |
| I-31 | A purpose's tier changed after bookings exist | Existing bookings keep their tier | L6 |
| I-32 | A grant of `spaces.booking.decide` on one venue | The holder decides for that venue's spaces and no other | part 6 |
| I-33 | A theatre-wide closure created over more Confirmed bookings than one set may hold, with the set limit lowered for the test | Every booking Bumped across the listener and the spaces.clear-window job; each booker told once; no unit over the statement or set limit; a repeated chunk changes nothing | L2, many bookings at once |

## End-to-end tests

In a browser, at phone and desktop widths, each also run through the accessibility checker.

| Id | Journey |
| --- | --- |
| E-01 | A member opens the calendar, picks a free time, books, and sees it on the calendar and in My bookings |
| E-02 | A member asks for a room needing approval; a room manager confirms it from the Requests list; the member's page shows Confirmed with the note |
| E-03 | The request form's status line changes as the time is moved onto a performance, and the offered free time fills the form |
| E-04 | A weekly series with a clashing date: the panel lists it, it is left out, the button reads "Book 9 of 10" |
| E-05 | A whole booking made, changed and cancelled using the keyboard only, from the List view |
| E-06 | A bumped member follows the link in the message and books again with the details filled |
| E-07 | An administrator makes a space bookable, sets hours and switches off a purpose; a member then cannot choose that purpose there |
| E-08 | The calendar in greyscale: every state is still told apart |

## Checks the build runs

- The manifest names every listener and task file, and each exists.
- Every notification type has a template in `en-GB`, and its variables match.
- Every refusal code has a message in the catalogue.
- No file under `layers/spaces/` imports another module's file other than `#modules/core`.
- The data-class check: every personal or free-text column has an erasure behaviour, and both booking tables have a subject and a retention.

## What is not tested here

The calendar component's own behaviour belongs to Interface (its story UI-35). Email delivery is core's. Load beyond the proof is not tested: a theatre's room diary is small, and the calendar route is bounded to 31 days.
