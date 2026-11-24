# 8. Test plan

Inventory is tested in the three tiers Foundations fixed: unit tests for pure rules, integration tests against a local D1 in workerd, and end-to-end tests in a browser, all on CI. One proof comes before any other work: that a thing cannot be promised twice. There are 6 proof runs, 42 integration cases and 10 end-to-end cases.

## The proof to run first

**Claim.** Rules C1 to C3 and C6: of any number of attempts to promise the same individual item over overlapping windows, exactly one succeeds; promises of a counted item never add up to more than its quantity; and a container is promised whole or not at all.

**Method.** The shape of Box office's last-seat proof and Spaces' P-1 to P-7: a small Worker with `inventory_items` and `inventory_loan_lines` and the promising statements, and a runner that fires attempts at once.

| Run | Attempts | Pass when |
| --- | --- | --- |
| P-1 | 50 loans promising one individual item for the same window | 1 promised, 49 refused `inventory.loan.clash`, no error of any other kind |
| P-2 | 50 loans of one item, each window overlapping its neighbour by one day | No two promised windows overlap; at least 25 are promised |
| P-3 | 20 loans each asking for 1 of a counted item with quantity 10, same window | Exactly 10 promised, 10 refused |
| P-4 | 30 loans asking for 1 to 4 each of the same counted item, overlapping windows | On every day, promised quantities add to 10 or fewer; no refusal while the asked amount still fitted |
| P-5 | An item out and past its due date; 20 promises for windows starting tomorrow, then the item returned and 20 more | All of the first 20 refused; exactly 1 of the second 20 promised |
| P-6 | A container with 5 contents promised to one loan while another loan promises one of the contents, at once | Either the container with all 5, or the single item; never the container without one of its contents |

P-1 to P-6 run locally and then against a deployed D1, and the result is recorded in this tab, dated. Rule C5, the Spaces predicate, is proved by I-39 once Spaces' amendments exist.

**Not yet run.** This part specifies the proof; no code exists.

## Unit tests

Pure functions, no database.

| Area | Cases |
| --- | --- |
| Windows | Touching windows do not overlap; one inside another does; a window to the close of the operating day, with `core.locale.day-start` at 04:00; a due date on the day the clocks change |
| Open-ended out lines | An out line before, on and after its due date counted as busy to the right end |
| Counted sums | Quantities across overlapping windows that touch at one end, nest, and chain |
| Tags | Prefix and number formatting; numbers past 9999; a prefix change applies only to new numbers |
| Due dates | Interval from a pass; `first-due` both ways; superseded results ignored; an excused kind skipped |
| Overdue | Worked out from today in Europe/London; a kind that blocks and one that does not |
| Service predicate | Every combination of open fault, failed kind and by-hand reason returns the right answer and names what remains |
| Production dates | Last performance plus grace; a cancelled last performance; a production with none |
| Reminders | Due within the window; overdue on each cadence day; already reminded today |
| State moves | Every pair of states for items, loans, lines, faults and disposals: the allowed moves succeed, every other pair is refused |
| Shaping | The members' catalogue never carries value, serial or owner; a loan view without the ability never carries contact details |
| Labels | Each size fits its sheet; a long name is cut, never wrapped over the QR code |

## Integration tests

Against local D1, through the routes, with the clock replaced.

| Id | Scenario | Expect | Rules |
| --- | --- | --- | --- |
| I-01 | Add an item to a category with two inspection kinds | Item, tag, `added` event and two dues written in one unit | I1, N1 |
| I-02 | Two people add items to one department at once | Different tags, counter raised by both | I2 |
| I-03 | Change a department's tag prefix | Existing tags unchanged; the next item uses the new prefix | I3 |
| I-04 | Change tracking on an item with one loan line | Refused | I4 |
| I-05 | Move by hand an item that is promised | Refused | I5 |
| I-06 | Move a container | Contents moved in the same unit, one event each | I6 |
| I-07 | Archive a location that is an active item's home | Refused, naming the count | I8 |
| I-08 | Read the members' catalogue as a member | No value, serial or owner in the response | I9 |
| I-09 | Move an inspected item to a category without that kind | Due kept with `applies` false and reason `recategorised`; new kinds added | I12 |
| I-10 | A member asks to borrow from a department that lends to productions only | Refused | L3 |
| I-11 | A loan made by a non-approver, by an approver, and by an approver who is its responsible person | Requested, Approved, Requested | L4 |
| I-12 | A line for an item of another department | Refused | L2 |
| I-13 | Approve a pull list with one line not free | Nothing promised; the line named with its reason | L7 |
| I-14 | Submit with wanted lines, then match one | The match is a promise under C1 to C6 | L6 |
| I-15 | A production's last performance moves a week later | Its `from-production` loans re-dated in one statement; one that would clash keeps its date and the department is told | L9 |
| I-16 | A production is cancelled | Draft, requested and approved loans cancelled with reason `production-cancelled`; an out loan untouched | L9 |
| I-17 | Extend a loan into another loan's window | Refused, naming the other loan | L10 |
| I-18 | Check out the day before the window starts | Refused | L11 |
| I-19 | Scan a tag not on the loan, with and without `inventory.loan.approve` | Offered as an added line and promised; refused | L12 |
| I-20 | Return 6 of 10 counted, then 4 | Line out, then returned; loan returned and stamped | L13, L15 |
| I-21 | Mark a line lost, individual and counted | Item missing; disposal proposed with method `lost` | L13 |
| I-22 | Return with condition damaged | Fault with source `return`, item out of service, same unit | L14 |
| I-23 | Cancel a loan that is out | Refused | L16 |
| I-24 | Decline with a note | Lines cancelled; borrower notified once, with the note | L17 |
| I-25 | Check out to someone lacking training; override with a reason under a fresh sign-in; requirement service unavailable | Refused; out and audited with the reason; shown as "not checked" | K2 to K4 |
| I-26 | Check out to an outside borrower with no account, to an item with a requirement | Needs an override | K5 |
| I-27 | Record a pass | Due's next date is the pass date plus the interval | N2 |
| I-28 | Record a fail | Item out of service, due cleared, fault opened, `inventory.item.withdrawn` announced, one unit | N6 |
| I-29 | Promise an item overdue on a blocking kind, and on a non-blocking kind | Refused; allowed | N7, C4 |
| I-30 | Pass after a fail while a fault is still open | Item stays out; the open fault is named | N8, F4 |
| I-31 | Correct a result by superseding | Due recomputed from the newest unsuperseded result; nothing edited | N9 |
| I-32 | Halve a kind's interval | Every applying due recomputed in one statement; recorded inspections unchanged | N10 |
| I-33 | Record as someone lacking the kind's requirement; as a contractor | Refused; allowed, firm named | N5 |
| I-34 | Approve a disposal as its proposer; as a proposer holding the Owner role | Refused; allowed | D2 |
| I-35 | Mark a disposal done for an item with a future promise and a container | Line cancelled `item-withdrawn` and department told; container cleared; dues stop; event announced | D3 |
| I-36 | Run the reminders task twice on one day | Each due-soon and overdue loan told once | R1, R3 |
| I-37 | Run the retention sweep past `inventory.loans.keep-for` | Personal and free-text columns erased on final loans; item history whole | R5 |
| I-38 | Erase a borrower's account; merge two accounts | Their loans anonymised in one unit; responsible person moved to the survivor | part 2 |
| I-39 | With Spaces: promise an item over a confirmed booking, and book over a promised loan | Both refused | C5, B2, B3 |
| I-40 | Take a bookable item out of service; dispose of one | Spaces pauses the first, archives the second | B4 |
| I-41 | Run the export as a holder of `inventory.item.export` and as one without | Schedule with values; refused | I9 |
| I-42 | Read each measure with and without its ability | Aggregates only; refused without | part 4 |

## End-to-end tests

In a browser against a seeded local build.

| Id | Journey |
| --- | --- |
| E-01 | First run: the setup step from no departments to a first item, its label printed, and the label's tag typed into search to open it |
| E-02 | A stage manager starts a pull list, the department matches and approves it, the desk checks it out, and it comes back with one item damaged; the fault appears in the faults list |
| E-03 | A member requests kit from Borrow kit; the approver approves; My loans shows it approved |
| E-04 | A PAT session over five items, one failing; the failed item shows out of service and cannot be added to a loan |
| E-05 | A fault reported from a show report's link, with the production filled in |
| E-06 | A disposal proposed by one person and approved by another |
| E-07 | The kit desk at phone width, scanning by camera and falling back to typing a tag |
| E-08 | The kit desk by keyboard only, with scanner input arriving as keystrokes |
| E-09 | A desk volunteer meets a training refusal and cannot see Override; a technical manager overrides it |
| E-10 | Accessibility checks on Items, the item page, the loan page, the kit desk and Borrow kit |
