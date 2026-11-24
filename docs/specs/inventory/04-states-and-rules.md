# 3. States and rules

Four records have a life cycle (an item, a loan, a loan line and a disposal) and a fault has a short one. Every move is one guarded statement in a unit with its item event, its audit entry and its announced event, so two people acting at once can never both succeed. Rules carry ids, cited by the stories (part 7) and the tests (part 8): I for items, L for loans, C for the promise check, K for requirements, N for inspections, F for faults, D for disposals, B for bookable items, R for reminders and retention.

## Items

(Diagram in the Claude Doc: https://claude.ai/artifact/3H4CVrVcLN1aDku92AmXit) item states · 4 states, 1 final

Only an Active item can be promised, checked out or booked; every way out of Active is recorded with its reason, and Disposed never comes back.

| From | To | By | Guard |
| --- | --- | --- | --- |
| (new) | active | Adding, alone or several at once | I1, I2 |
| active | out of service | A failed inspection (N6), a fault that takes it out (F1), or by hand | The reason is recorded; by hand needs `inventory.item.edit` |
| out of service | active | The last reason clearing: a passing inspection, every taking fault closed, or by hand for a by-hand reason | F4 |
| active, out of service | missing | Marked missing, or a line returned as lost (L13) | Not while out on a loan unless the line is marked lost |
| missing | active | Found | Back to its home location unless a location is given |
| any but disposed | disposed | A disposal done (D3) | Final. Nothing moves an item out of disposed |

- **I1. One unit adds an item.** Its row, its tag, its `added` event, its tags and one inspection due per kind that applies (N1, N4) are written together. Adding several alike is one unit with set-wise statements, up to `core.units.set-rows-limit` items.
- **I2. Tags come from the department's counter inside the statement.** The insert builds `<prefix>-<number>` from `next_tag_number` read in the same statement, and the next statement in the batch raises the counter by the number added, so two people adding at once never get the same tag. A tag is never changed or reused, even if the item moves to another department.
- **I3. A new tag prefix applies only to new items.** Existing labels stay true.
- **I4. Tracking is fixed once used.** An item with any loan line or inspection cannot change between individual and counted.
- **I5. Moving is not lending.** Setting a location other than home sets `current_location_id`; moving it home clears it. An item promised or out on a loan cannot be moved by hand.
- **I6. Containers.** A container is an individual item and is in no container itself, so nesting is one level. Moving a container moves its contents in the same unit. Promising a container promises each content item on its own line, linked by `with_line_id`, under every check; one failure refuses the container. A content item can be taken out of its container by editing it, which is an event on both.
- **I7. States are worked out, never typed.** No screen offers a state picker: each state follows from an action in this table.
- **I8. Nothing in use can be archived.** A location that is any active item's home, a category with active items, and a department with active categories are refused archiving, naming the count.
- **I9. Values and owners are for staff.** Replacement value, owner details and serial numbers are shown only to holders of `inventory.item.edit` or `inventory.item.export`, never in the members' catalogue.
- **I10. Text about a thing stays about the thing.** Description and inspection readings have help text that says so. Free text that may name a person lives only in a loan's purpose and decline note and a fault's description and resolution, which erasure and retention redact.
- **I11. Owners are organisations.** A hired-in or borrowed-in item names an organisation or a desk, never a private person. Kit lent by a private person is a later story (INV-53).
- **I12. Changing category recalculates dues.** Kinds of the new category are added as dues. Kinds that came only from the old category are removed if never inspected, or kept with `applies` false and reason `recategorised` if they were, so history stays linked.

## Loans and their lines

(Diagram in the Claude Doc: https://claude.ai/artifact/3H4CVrVcLN1aDku92AmXit) loan states · 7 states, lines beside them

Approval is the one moment every line is promised under the check below; after it, lines go out and come back one at a time, and the loan is Returned when nothing is left out.

| Loan from | To | By | Guard |
| --- | --- | --- | --- |
| (new) | draft | A production's pull list | `inventory.pull-list.edit` on the production (L5) |
| (new), draft | requested | A member asking, or a pull list submitted | L3, L4 |
| (new), draft, requested | approved | An approver, or a loan made directly by a holder of `inventory.loan.approve` | L7: every listed line promised under C1 to C6 |
| requested | declined | An approver, with an optional note | Lines released |
| draft, requested, approved | cancelled | The borrower for their own; staff for any; a listener when the production is cancelled | L16 |
| approved | out | The first line checked out at the kit desk | L11, K2 to K5 |
| out | returned | The last line returned or marked lost | L15 |

| Line from | To | By |
| --- | --- | --- |
| (new) | wanted | A pull-list line with no item yet |
| wanted | listed | Matched to an item while the loan is a draft |
| wanted, listed | promised | The loan approved, or a line matched or added after approval (C1 to C6) |
| promised | out | Checked out |
| out | returned | Returned in full |
| out | lost | Marked lost at the desk or by a loan's manager (L13) |
| wanted, listed, promised | cancelled | Removed, or its loan cancelled or declined |

- **L1. A loan is never edited into a past it did not have.** A returned, declined or cancelled loan is final.
- **L2. One department per loan.** Every line's item belongs to a category of the loan's department. A production wanting props and costume has two pull lists, one per department, shown together on its page.
- **L3. The department decides who may borrow.** `lends_to` `productions` allows production loans only; `members` adds members; `anyone` adds outside borrowers. Items with `lendable` false are never on a line.
- **L4. Asking is not deciding.** A loan made by someone who does not hold `inventory.loan.approve` on the department is Requested. A holder making a loan, such as the wardrobe lead lending to a visiting company, makes it Approved in the same unit, under L7.
- **L5. Pull lists belong to the production.** Anyone holding `inventory.pull-list.edit` on the production may add, match and remove lines while it is a draft, and submit it. The department sees drafts, so it can start finding things early.
- **L6. Wanted lines may stay wanted.** A pull list may be submitted with wanted lines; the department may match them later, and each match is a promise under C1 to C6. A wanted line never blocks anything.
- **L7. Approval promises every listed line or none.** If any line fails C1 to C6, approval is refused and the screen names each failing line and why. The approver may remove lines and approve the rest.
- **L8. Due back means the end of that night.** `due_back_on` ends at the close of its operating day (`core.locale.day-start`), so kit back after a Saturday get-out at 01:00 Sunday is on time.
- **L9. Production loans follow the production.** A production loan's due date defaults to the operating day of the production's last performance plus `inventory.loans.production-grace`, marked `from-production`. A listener on `core.performance.moved`, `.rescheduled` and `.cancelled` recalculates those dates set-wise for loans not yet returned. Where a new date would break C1, the loan keeps its date and the department is told. When a production is cancelled (`core.production.cancelled`), its draft, requested and approved loans are cancelled with reason `production-cancelled`; loans already out stay out.
- **L10. Extending is a promise again.** A new due date is checked under C1 to C6 for every promised and out line. Someone without `inventory.loan.approve` asks, and the approver decides.
- **L11. Check-out starts on the start day.** A promised line can be checked out from the operating day of `starts_at`. Earlier means moving the start, which is a promise again. Each line records the person, the time and the condition going out.
- **L12. The desk scans, the server decides.** A scanned tag not on the loan is offered as an added line, which is a promise (C1 to C6) and needs the approver's ability.
- **L13. Returns may be partial.** A counted line adds to `returned_quantity` until the whole quantity is back. A line marked lost makes an individual item missing, or proposes a disposal of the missing quantity of a counted item, method `lost`.
- **L14. Damage on return opens a fault.** Returned condition `damaged` opens a fault with source `return`, taking the item out of service, in the same unit. Any returned condition becomes the item's condition.
- **L15. A loan is returned when nothing is out.** The unit that clears its last promised or out line sets the loan Returned and stamps `returned_at`.
- **L16. An out loan cannot be cancelled.** Its lines can only be returned or marked lost.
- **L17. Declining releases everything.** Its lines become Cancelled, and the borrower is told, with the note if one was written.

## The promise check

The gate of this module (part 8, the lending proof). It is one predicate on the statement that moves a line to Promised, or changes a promised or out line's window, followed by `.expect(n)`.

- **C1. An individual item is promised to one loan at a time.** No other line for the item in Promised or Out has a window overlapping this one. A window runs from `starts_at` to the close of `due_back_on`'s operating day.
- **C2. A counted item is never over-promised.** The quantities of overlapping Promised and Out lines, plus this one, are at most the item's quantity.
- **C3. An out item is busy until it is back.** An Out line past its due date counts as open-ended, so an overdue item cannot be promised for a window that starts before it returns.
- **C4. Only usable items are promised.** The item is active, lendable, not proposed for disposal, and not blocked by an inspection due before the window starts (N7).
- **C5. A bookable item is also free in Spaces.** The statement carries the predicate every `inventory.diary` contributor supplies for the item and the window (B3).
- **C6. A container goes whole.** Its contents' lines are promised in the same statement set, and the unit expects every row.

The check runs on statements, not on a read before them: two approvers promising the last haze machine at once get one success and one refusal `inventory.loan.clash` naming the other loan.

(Diagram in the Claude Doc: https://claude.ai/artifact/3H4CVrVcLN1aDku92AmXit) approving a pull list · all lines promised or none

## Requirements on kit

- **K1. Requirements are references.** A line's requirements are its department's, its category's and its item's lists together. Inventory stores them as text and never reads inside one.
- **K2. Approval warns; check-out decides.** At approval, the responsible person is checked for the window's start and any unmet requirement is shown as a warning. At check-out the check is binding.
- **K3. One call, at the moment.** `requirements.check({ accounts: [responsible], refs, at: now, whenUnavailable: 'met' })`. An unavailable verdict is shown as "not checked", never as met in words.
- **K4. Overrides are named.** A line whose person does not meet a requirement goes out only when a holder of `inventory.requirement.override` (privileged, fresh sign-in) confirms with a reason. The line records who; the audit entry keeps the reason.
- **K5. Whoever collects becomes responsible.** At check-out the desk asks who is collecting, from the production team or the borrower, and that account becomes the loan's responsible person, so the requirement is checked against the person actually holding the kit. An outside borrower with no account meets no requirement and needs an override.

(Diagram in the Claude Doc: https://claude.ai/artifact/3H4CVrVcLN1aDku92AmXit) checking out one line at the kit desk · three checks and the override

## Inspections

(Diagram in the Claude Doc: https://claude.ai/artifact/3H4CVrVcLN1aDku92AmXit) inspection, fault and disposal · how each acts on an item

A pass sets the next date; a fail takes the item out and opens a fault in the same save, and the item returns only when every reason is clear.

- **N1. Dues live in one table and move with their causes.** Adding an item, changing its category, adding or removing a kind on a category, changing an interval and recording an inspection each write `inventory_inspection_dues` in the same unit, set-wise.
- **N2. A pass sets the next date.** Next due is the pass date plus the kind's interval, stored on the due and on the inspection.
- **N3. One item may be excused.** A holder of `inventory.item.edit` may set a category's kind not to apply to one item, with a reason code (`not-electrical`, `not-used-for-lifting`, `other`), recorded as an event.
- **N4. New items fall due by the setting.** With `inventory.inspections.first-due` `on-adding`, a new item is due on the day it is added; with `after-interval`, a new purchase is taken as tested and is due one interval later.
- **N5. The inspector must qualify.** Recording an inspection asks `core.requirement` about the recorder against the kind's requirements. Unmet, it is refused unless a holder of `inventory.requirement.override` confirms. A result recorded on behalf of a contractor names the firm, and the requirement does not apply.
- **N6. A fail takes the item out at once.** The same unit sets the item out of service (`inspection-failed`), clears the due's next date, opens a fault with source `inspection`, and announces `inventory.item.withdrawn`.
- **N7. Overdue blocks where the kind says so.** For a kind with `blocks_when_overdue`, an item whose next due date has passed may not be promised for a window starting after that date, checked out, or booked. Overdue is worked out from the date, never stored.
- **N8. A pass after a fail brings it back.** A passing inspection of the failed kind returns the item to service, unless another reason remains (F4).
- **N9. Corrections supersede.** A wrong result is corrected by a new inspection naming the one it replaces; the due is recomputed from the newest unsuperseded inspection. Nothing is edited or deleted.
- **N10. A new interval moves future dates only.** Changing a kind's interval recomputes the next due date of every applying due from its last pass, in one statement. Inspections already recorded keep the date they set.

## Faults

| From | To | By |
| --- | --- | --- |
| (new) | open | Reported, found on return (L14) or by a failed inspection (N6) |
| open | repaired | A holder of `inventory.fault.manage`, with what was done |
| open | written off | The same, which proposes a disposal (F3) |

- **F1. Reporting is open, deciding is not.** Anyone holding `inventory.fault.report` may report a fault on an item they can see; the reporter chooses whether it takes the item out of service, and a manager may change that.
- **F2. Repaired brings it back.** Closing a fault as repaired returns the item to service if no other reason remains, and sets its condition.
- **F3. Written off means disposal.** Closing a fault as written off proposes a disposal (method `scrapped` by default) in the same unit.
- **F4. Back in service needs every reason clear.** The statement that returns an item to service carries the predicate: no open fault that takes it out, the latest unsuperseded result of every applying kind not a fail, and no by-hand reason. Otherwise the item stays out and the screen names what remains.

## Disposals

| From | To | By |
| --- | --- | --- |
| (new) | proposed | A holder of `inventory.item.edit`, or a fault written off, or a counted line lost |
| proposed | approved | A holder of `inventory.disposal.approve` who did not propose it |
| proposed | declined | The same |
| proposed, approved | done | The proposer or the approver, once it has physically gone |

- **D1. A proposed item stays put but stops going out.** It keeps its state, and C4 refuses new promises.
- **D2. A second person approves.** The proposer may not approve (`owner: 'refuses'`; the Owner role is exempt). Where the item's replacement value is at or below `inventory.disposals.approve-above` and that setting is above nought, the proposer may mark it done without approval.
- **D3. Done is final, and tidies up.** The item becomes Disposed (or a counted item's quantity falls, Disposed at nought). In the same unit its future promised lines are cancelled with reason `item-withdrawn` and each loan's department told, it leaves its container, its dues stop applying, and `inventory.item.withdrawn` is announced.
- **D4. No undo.** A disposal done in error is put right by adding the item again; the history of the old one stays.
- **D5. Recipients are organisations.** "Donated to Leamington Youth Theatre"; a private buyer is "Private sale".

## Bookable items

- **B1. Spaces owns the diary.** Making an item bookable, its opening hours, purposes and bookings are Spaces' rows and routes. Inventory never writes them.
- **B2. Inventory describes the item to Spaces.** Through `spaces.resource-origin` it gives the name, a home venue (from the home location), the requirements (K1), whether it is usable, and a predicate: active, lendable, not blocked by an overdue inspection, and no Promised or Out line overlapping the window.
- **B3. Spaces tells Inventory about bookings.** Through `inventory.diary`, Spaces gives a predicate that no confirmed booking overlaps the window. Inventory puts it on every promise and window change (C5); for an item that is not bookable it is absent.
- **B4. Withdrawn items leave the diary.** `inventory.item.withdrawn` with reason out-of-service or missing makes Spaces pause the bookable; with reason disposed, archive it. Spaces tells the affected bookers as it does for a closure.

## Reminders and retention

- **R1. Loans remind their borrowers.** The daily task `inventory.remind-loans` (09:00 in the theatre's time zone) tells the responsible person, or an outside borrower's email, when a loan is due back within `inventory.loans.remind-before`, and again every `inventory.loans.overdue-every` while it is overdue.
- **R2. Inspections remind their departments.** The weekly task `inventory.remind-inspections` (Mondays 09:00) sends each department's inspectors one digest of what falls due within `inventory.inspections.remind-before` and what is overdue.
- **R3. Nobody is reminded twice in a day.** `last_reminded_on` and the notification dedupe key (loan id and date) stop a repeat when the task runs again.
- **R4. Hired-in kit goes back on time.** The daily task also tells holders of `inventory.item.edit` on the department when a hired-in or borrowed-in item is due back to its owner within `inventory.hired-in.remind-before`.
- **R5. Retention erases, never deletes.** The sweep for `inventory.loans.keep-for` and `inventory.faults.keep-for` sets personal and free-text columns to their erased values on final rows past the period, so an item's history keeps every row it points at.
