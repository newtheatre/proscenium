# 1. Scope

Inventory knows what physical things the theatre keeps, where they are, who has them, whether they are safe, and how they leave. It is module `inventory`, switchable, requires only core, owns fourteen tables, and is off until a theatre switches it on.

## What it does

- **A catalogue.** Items with photos, a tag and a QR label, sorted into departments and categories, each with a home location. Things that are alike and never inspected one by one (forty coat hangers) are one counted item with a quantity.
- **Locations.** Stores, rooms and shelves as a tree, optionally placed at a core venue or space. An item has a home and may be moved elsewhere without being lent.
- **Containers.** A flight case or a costume rail can hold other items; lending or moving the container takes its contents with it.
- **Loans.** To a production, a member or an outside borrower, from a date to a due-back date, with condition recorded at check-out and on return. Nothing is ever promised twice over the same time.
- **Pull lists.** A production's list of wanted props or costume, built up during rehearsals, each line matched to an item or still to find, make or buy. Approved, it is the loan.
- **The kit desk.** Scan labels to check out and return; partial returns; damage on return opens a fault.
- **Requests from members.** A member browses what the theatre lends and asks to borrow; the department approves or declines.
- **Inspections.** Kinds such as PAT testing, visual checks and lifting-equipment examinations, attached to categories with an interval, recorded per item with a result and an optional certificate. Reminders before they fall due. A failed one takes the item out of service; an overdue one stops it going out.
- **Training on kit.** A category or item may require a competency to borrow or use it, checked through `core.requirement` at check-out, with a privileged override.
- **Faults.** Anyone allowed can report one, including from a production's show report. A fault takes the item out of service until it is repaired or written off.
- **Disposal.** Sold, donated, scrapped, lost or stolen, proposed by one person and approved by another; the item keeps its history.
- **Hired-in kit.** Items the theatre hires or borrows from others, with the owner and the date they go back.
- **Bookable items.** Through Spaces, an item can have a diary (a projector, a van). Loans and bookings never overlap.
- **Figures and an insurance schedule.** Counts for Reports through `core.measure`, and a spreadsheet of items with replacement values by location.

## What it does not do

| Not here | Where it is |
| --- | --- |
| Bar stock: drinks, snacks and anything sold | Bar. Bar stock is consumable goods for sale; Inventory keeps durable things |
| Consumables used up in a show (gaffer tape, batteries, paint) | Not in any module. A theatre may keep them as counted items, but nothing is used up or reordered |
| A diary for a bookable item, its rules and approvals | Spaces. Inventory only says whether the item is free and usable (part 4) |
| Taking money: hire fees, deposits, charges for damage | Later (question 1), as lines in Companies' settlements or through Payments. Inventory's first release holds no money; a replacement value is a valuation, never a ledger entry |
| Documents with a review cycle (an equipment risk assessment, a contractor's certificate) | Governance's document register. Inventory contributes the document kinds; its own inspection records stay here |
| Who is in a production team, show reports, production tasks | Productions. Inventory adds a tab and a fact to the production's page |
| The company record for a visiting company or hirer | Companies. A loan may name one by record reference |
| Training courses, sign-offs and competencies | Training. Inventory stores references and asks the question |
| Buying kit: purchase orders, budgets, supplier invoices | Budgets and claims; Invoices and exports |

## Assumptions about other modules

1. Settings are site-wide (Foundations, question 1). A value that varies by department, category or item is a column that falls back to the setting.
2. One D1 database; every write is a unit of work, and every contended write is a guarded statement with the predicate on the statement (decision records 0001, 0003, 0006).
3. Core gives venues, spaces, productions, performances, files, vocabularies, notifications, the record resolver and the account scope, as built on `next` on 23 November 2026.
4. `core.requirement` answers training questions; Training stays the source and is never imported. With Training off, a requirement answers unavailable and Inventory treats it as met, as every host that restricts does (whenUnavailable `met`).
5. Spaces will accept the four amendments in part 4. Without them, everything except bookable items works.
6. Productions, Companies and Governance are soft: Inventory `uses` them and runs with each of them off.
7. Dates a person acts on (due back, next inspection) are local dates in the theatre's time zone; moments (checked out at) are instants. A due-back date ends at the close of that operating day, not at midnight (decision record 0014).

## Glossary

This module owns these words. Words owned elsewhere keep their owners' meaning: venue, space, production and performance are core's; bookable and booking are Spaces'; competency is Training's; fault is used here only for kit.

| Word | Meaning |
| --- | --- |
| item | One entry in the catalogue: a single thing, or a counted set of identical things |
| individual item | An item that is one physical thing, with its own tag, condition and inspections |
| counted item | An item kept as a quantity of interchangeable things (forty hangers). It has no inspections |
| tag | An item's short code, its department's prefix and a number: `LX-0042`. Unique, never reused |
| label | The printed sticker carrying the tag and a QR code that opens the item |
| kit department | A top-level grouping (Props, Costume, Set, Technical) that owns categories and loans and scopes grants. "Department" in this document always means a kit department |
| category | A grouping inside a kit department (Lighting fixtures, Hats) that carries default requirements and inspection kinds |
| location | A place things are kept: a store, a room, a rail, a shelf. Locations form a tree |
| home | The location an item belongs at |
| container | An item that holds others, such as a flight case; its contents move and go out with it |
| condition | How an item is: as new, good, worn or damaged |
| loan | Items lent from one kit department to one borrower for a window of time |
| loan line | One item, or a quantity of a counted item, on a loan |
| borrower | Who a loan is for: a production, a member, or an outside borrower |
| responsible person | The account answerable for a loan; for a production, the person who signs at check-out |
| outside borrower | A person or organisation with no part in the theatre, recorded by name and email, optionally linked to a company |
| pull list | A production's loan while it is still being gathered: lines matched to items, or wanted |
| wanted line | A pull-list line with no item yet: "Victorian teapot" |
| kit desk | The screen where items are checked out and returned by scanning |
| check out, return | Handing an item over on a loan, and getting it back |
| overdue | Out on a loan past its due-back date. Not a state; worked out from the date |
| inspection kind | A check that recurs, such as a PAT test, with an interval and who may carry it out |
| inspection | One recorded check of one item: a result, a date, who did it |
| out of service | Not to be lent or booked: failed an inspection, has an open fault, or taken out by hand |
| fault | A reported problem with an item, open until repaired or written off |
| disposal | An item leaving the theatre for good: sold, donated, scrapped, lost, stolen, or returned to its owner |
| hired-in | Belonging to someone else and held for a while, with a date it must go back |

### Words that needed a ruling

| Word | Clash | Use here |
| --- | --- | --- |
| stock | The bar's word for goods it sells | Never used. Inventory says item, quantity or counted item (the bar spec's own request) |
| maintenance | The module id `maintenance` (site maintenance mode) | Never used for kit. Say inspection, repair or fault |
| booking | Spaces' room or resource booking; Box office's ticket booking | Inventory never books. A thing in Spaces' diary is a booking there; here it is a loan |
| request | Identity's data request, Spaces' booking request, Box office's complimentary request | Always "loan request" outside this document |
| reserve, hold | Box office's seat hold, the bar's reservations | A loan line is "promised" once its loan is approved. Never "held" |
| department | Budgets and claims budgets by department; Governance has committee posts | "Kit department" in shared copy; under discussion with Budgets and claims (part 4) |
| return | Box office's returns of tickets | "Return" only of an item on a loan; in shared copy, "kit return" |
