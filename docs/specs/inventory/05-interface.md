# 4. Interface

Inventory requires only core and reaches every other module softly: through core's points, one point of its own, events, and record references resolved by core. No other module needs Inventory to run, and Inventory runs with every module but core switched off.

## Manifest in brief

| Field | Value |
| --- | --- |
| `id` | `inventory`, to be added to `RESERVED_MODULE_IDS` when this spec is accepted (Foundations' index names inventory as the first module waiting for one) |
| `requires` | `core` |
| `uses` | `spaces`, `productions`, `companies`, `governance`. Each is soft: points and events only, never services. The last three must be reserved ids first |
| `stability` | `experimental` until the first release ships |
| `switchable` | yes; off at setup. `switchOff.impact()` reports items out on loan and loans waiting: "23 items are out on 6 loans; borrowers will get no more reminders" |
| Tables | Fourteen (part 2) |
| Settings, abilities | 13 settings, 16 abilities (part 6) |
| Tasks | `inventory.remind-loans` (daily 09:00), `inventory.remind-inspections` (weekly, Monday 09:00) |
| Jobs | `inventory.recalculate-due-dates` (prompt lane, from L9's listener), `inventory.export-schedule` (bulk lane, the insurance schedule) |

## Record types

| Record type | Table | Parent | Owner |
| --- | --- | --- | --- |
| `inventory.department` | `inventory_departments` | none | none |
| `inventory.category` | `inventory_categories` | `inventory.department` | none |
| `inventory.item` | `inventory_items` | `inventory.category` | none |
| `inventory.location` | `inventory_locations` | `core.venue`, optional | none |
| `inventory.loan` | `inventory_loans` | `inventory.department` | `responsible_account_id` |
| `inventory.inspection-kind` | `inventory_inspection_kinds` | none | none |
| `inventory.fault` | `inventory_faults` | `inventory.item` | none |
| `inventory.disposal` | `inventory_disposals` | `inventory.item` | `proposed_by` |

So a grant on the Costume department reaches its categories, items, faults and disposals and every costume loan. Each type has a resolver in `core.record-resolver`, giving the title (an item's tag and name; a loan's borrower and dates, with the borrower's name only for a viewer who may see the loan) and its console address.

## Services

Named exports of `layers/inventory/server/services.ts`, for a module that lists `inventory` in `requires`. None does today; they are offered for Festival's venue-day sheets and a theatre's own modules.

| Service | Returns or does |
| --- | --- |
| `getItem(id)`, `itemByTag(tag)` | One item with its state, location, condition and dues |
| `itemsAt({ venueId, spaceId, locationId })` | Items whose current or home location is there, for a festival's "what kit is in this room" |
| `loansForProduction(productionId)` | The production's pull lists and loans with their lines |
| `isPromisable(itemId, from, to, quantity)` | Runs C1 to C6 without writing, for a picker that greys out what cannot be had |

No service writes. A module that wants to lend kit does it through Inventory's screens.

## The point Inventory declares

**`inventory.diary`** (code point). A module that keeps its own diary for items contributes, so a loan never overlaps its use. Spaces is the only contributor foreseen.

| Member | Meaning |
| --- | --- |
| `id` | `<module>.<name>` |
| `covers(itemIds)` | Which of these items it keeps a diary for. A read, async, never queued |
| `freePredicate(itemId, from, to)` | An SQL condition, true when nothing of the contributor's overlaps the window. Inventory adds it to every promise and window change (C5) |
| `blockers(itemId, from, to)` | What is in the way, for the screen: kind, start, end, a title and a link, with no names |

A switched-off contributor adds nothing, so with Spaces off an item lends as if it were never bookable; its Spaces bookings, if any, are frozen with Spaces.

## Contributions to core's points

| Point | What Inventory adds |
| --- | --- |
| `core.navigation`, `core.navigation-group` | Console group "Inventory": Items, Loans, Kit desk, Inspections, Faults, Disposals. Members' menu: "Borrow kit" (`/members/kit`), shown while the theatre lets members browse |
| `core.count` | Counts on the console entries: loans requested, loans overdue, inspections overdue |
| `core.home-card` | Console: "Overdue kit" (urgency today), "Loan requests waiting", "Inspections due this month" |
| `core.upcoming` | A member's own loans due back, on their home page |
| `core.record-tab` | On `core.production`: "Kit", the pull lists and loans for the production (agreed with Productions) |
| `core.record-fact` | On `core.production`: "12 items on loan, due back 14 March" |
| `core.quick-action` | "Check out kit" and "Report a fault" |
| `core.search-source` | Items by tag or name, for staff who may view them |
| `core.record-resolver` | The eight record types |
| `core.file-slot` | `inventory.item-photo` (images, 8), `inventory.item-document` (PDF, 5), `inventory.inspection-certificate` (PDF or image, 1), `inventory.fault-photo` (images, 4). The last two have `access: 'record'` |
| `core.file-access` | Certificates and fault photos only for viewers holding `inventory.item.view` on the item's department |
| `core.vocabulary` | `inventory.tag`, starting empty |
| `core.notification-type` | Eight types, below |
| `core.erasure-hold` | Loans still out hold their personal columns until returned |
| `core.change-guard` | Archiving a venue or space that a location names warns with the count of items stored there |
| `core.setup-step` | "Kit departments and stores", shown when the module is first switched on |
| `core.measure` | Five figures for Reports, below |

## Contributions to other modules' points

All soft: each module may be off, and its point then has no contributors.

| Point | Owner | What Inventory adds |
| --- | --- | --- |
| `spaces.resource-origin` | Spaces, asked for (below) | Record type `inventory.item`: describe, and the free predicate of rule B2 |
| `productions.schedule-entry` | Productions | Loan due-back dates on the production's schedule: `{ at, title: "Costume due back", kind: 'kit', to }` |
| `governance.document-kind` | Governance | `inventory.risk-assessment` attached to `inventory.category`, and `inventory.item-risk-assessment` attached to `inventory.item` (a smoke machine, pyrotechnics), each reviewed every 365 days, signed off by `inventory.item.edit` |
| `companies.settlement-charge` | Companies (their CO-44, later) | Later, INV-45: kit hire fees on a company's settlement |
| `forms.field-type` | Form builder (its FB-504 lists "Inventory: item") | Later, INV-50: an item picker question |

## Figures for Reports (`core.measure`)

As suggested by the Reports thread on 23 November 2026. Aggregates only; no row names a person.

| Figure | Unit, combine | By | Ability |
| --- | --- | --- | --- |
| `inventory.items` | count, level | `inventory.department`, `inventory.category`, `venue` | `inventory.item.view` |
| `inventory.inspections-due` | count, level | `inventory.inspection-kind`, `inventory.department` | `inventory.item.view` |
| `inventory.inspections-overdue` | count, level | `inventory.inspection-kind`, `inventory.department` | `inventory.item.view` |
| `inventory.inspections-done` | count, sum | `inventory.inspection-kind`, `month` | `inventory.item.view` |
| `inventory.loans-out` | count, level | `production`, `inventory.department` | `inventory.loan.view` |

## Events announced

Payloads hold ids and fixed codes only. None is internal: none says anything about a person's standing, welfare or access, so each may reach a webhook.

| Event | When | Payload |
| --- | --- | --- |
| `inventory.item.added` | An item is added | `itemId`, `categoryId` |
| `inventory.item.withdrawn` | Out of service, missing or disposed | `itemId`, `reason` (`out-of-service`, `missing`, `disposed`) |
| `inventory.item.restored` | Back in service, or found | `itemId` |
| `inventory.loan.requested` | A loan or pull list is submitted | `loanId`, `departmentId`, `productionId` or null |
| `inventory.loan.approved`, `.declined`, `.cancelled` | Decided or cancelled | `loanId`, and `reason` on cancelled |
| `inventory.loan.checked-out` | The first line goes out | `loanId` |
| `inventory.loan.returned` | The last line is back | `loanId` |
| `inventory.inspection.recorded` | An inspection is recorded or corrected | `inspectionId`, `itemId`, `kindId`, `result` |
| `inventory.fault.reported`, `.closed` | A fault opens or closes | `faultId`, `itemId`, and `outcome` on closed |
| `inventory.disposal.done` | An item leaves | `disposalId`, `itemId`, `method` |

## Events heard

| Event | Owner | What Inventory does |
| --- | --- | --- |
| `core.performance.moved`, `.rescheduled`, `.cancelled` | Core | Queues `inventory.recalculate-due-dates` for the production's `from-production` loans (L9) |
| `core.production.cancelled` | Core | Cancels the production's draft, requested and approved loans, telling each department (L9) |

## Notification types

All transactional, email and inbox, except where an outside borrower has no account, when `notifyAddress` sends email only.

| Type | To | Says |
| --- | --- | --- |
| `inventory.loan-requested` | Holders of `inventory.loan.approve` on the department | A loan or pull list is waiting |
| `inventory.loan-decided` | The responsible person, or the outside borrower | Approved, with dates and guidance; or declined, with the note |
| `inventory.loan-due` | The same | Due back on a date, with the department's contact |
| `inventory.loan-overdue` | The same | Overdue since a date; repeated by R1 |
| `inventory.loan-cancelled` | The same, and the department | Cancelled, and why |
| `inventory.inspections-due` | Holders of `inventory.inspection.record` on the department | The weekly digest (R2) |
| `inventory.fault-reported` | Holders of `inventory.fault.manage` on the department | A fault on an item, whether it is out of service |
| `inventory.hired-in-due` | Holders of `inventory.item.edit` on the department | Hired-in kit going back to its owner soon (R4) |

## Routes

Every route is `/api/inventory/...`, names an ability and a rate-limit class (`default` for reads, `write` for changes, `export` for the schedule). The kit desk's scan is a read by tag. Routes taking money: none.

## Asked of other modules

| Of | What | Story | State |
| --- | --- | --- | --- |
| Spaces | `spaces_bookables.origin`: a record reference (`inventory.item:``kit``_…`), unique where set, on kind `resource`; name, home venue, requirements and usability then come from the origin | SP-49 | Recorded by Integration as a pending amendment, 23 November 2026 |
| Spaces | Declare the code point `spaces.resource-origin` { recordType, describe(ids), freePredicate(originId, from, to) } and put the predicate on every confirming statement (its rule C2) | SP-50 | Pending, as above |
| Spaces | Contribute to `inventory.diary` the predicate that no confirmed booking overlaps | SP-51 | Pending, as above |
| Spaces | Own "Make bookable": its route, and a `core.record-check` on `inventory.item`. Listen to `inventory.item.withdrawn` and pause or archive the bookable, telling bookers | SP-52 | Pending, as above |
| Foundations | Enter the eleven prefixes in the index; reserve `inventory` | none | On acceptance |
| Productions | Their point `productions.schedule-entry`; a "report a fault" link on show-report notes to `/console/inventory/faults/new?production=<id>` | theirs | Agreed 23 November 2026 |
| Companies | Record type `companies.company` with a resolver; point `companies.settlement-charge` | their CO-44 | Agreed; Inventory's use is later |
| Governance | Point `governance.document-kind`, and its service `documentsForRecord` for listing documents on a record (Integration ruling R3-09) | theirs | Agreed |
| Reports | The kit point `core.measure` | theirs | Agreed |
| Budgets and claims | Core domain: the shared vocabulary `core.department`, which `department_term_id` points at and Budgets and claims also uses. Its terms carry a kind, production or organisation, and a kit department may point at either (Integration ruling R3-07) | none | A core amendment; provisional ruling by Integration, 23 November 2026 |
| Training | Competency references `training:tcmp_…`; `inventory` added to Training's `uses` | none | Agreed |
| Form builder | The item picker question (FB-504 already lists it) | INV-50 | Later |

## Index of names

| Kind | Names |
| --- | --- |
| Module | `inventory` |
| Point | `inventory.diary` |
| Facts | none |
| Record types | `inventory.department`, `.category`, `.item`, `.location`, `.loan`, `.inspection-kind`, `.fault`, `.disposal` |
| Vocabulary | `inventory.tag` |
| File slots | `inventory.item-photo`, `.item-document`, `.inspection-certificate`, `.fault-photo` |
| Measures | `inventory.items`, `.inspections-due`, `.inspections-overdue`, `.inspections-done`, `.loans-out` |
| Document kinds | `inventory.risk-assessment`, `inventory.item-risk-assessment` |
| Refusal codes | `inventory.loan.clash`, `.not-lendable`, `.out-of-service`, `.inspection-overdue`, `.requirement-unmet`, `.wrong-department`, `.state-changed`, `inventory.item.in-use`, `inventory.disposal.own-proposal` |
