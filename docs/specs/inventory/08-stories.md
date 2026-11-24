# 7. Stories

Inventory has 53 stories, INV-01 to INV-53: 4 gate, 39 in the rest of its first release and 10 later. Each cites the rules in part 3 it delivers, so a story is done when those rules' tests in part 8 pass.

|  | Gate | Rest of first release | Later | All |
| --- | --- | --- | --- | --- |
| Stories | 4 | 39 | 10 | 53 |

The gate is the proof that one thing cannot be in two places at once: no item promised twice, no counted item over-promised, and approval all or none. Nothing else is worth building until it passes.

## Gate

| Id | As | I want | So that | Rules | Rests on |
| --- | --- | --- | --- | --- | --- |
| INV-01 | a developer | the module, its fourteen tables, record types, abilities and settings declared in the manifest | everything else has somewhere to stand | part 2, part 6 | The kit; Foundations' prefix index entries |
| INV-02 | a department lead | an individual item never promised to two loans whose windows overlap, overdue loans counting as open-ended | the skull is never on two stages at once | C1, C3, C4 | INV-01 |
| INV-03 | a department lead | a counted item never promised beyond its quantity | ten goblets are never lent as twelve | C2, C3 | INV-02 |
| INV-04 | a developer | every state move to be one guarded update with its event row, and approval to promise all lines or none, containers whole | two people acting at once cannot both succeed | I7, L7, C6 | INV-01 |

## Setting up

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| INV-05 | an administrator | to set up departments with a tag prefix and who they lend to, from the setup step | each department runs its own kit | I2, I3, L3 | First |
| INV-06 | a department lead | categories that carry their inspection kinds and training needs | every item in a category inherits them | N1, K1, I12 | First |
| INV-07 | a technical manager | a tree of storage locations, each optionally in a venue or space | anyone can find the shelf | I5, I8 | First |
| INV-08 | a technical manager | inspection kinds with an interval, certificate rule, contractor rule and whether overdue blocks lending, starting from the four in part 6 | testing follows our policy, not a spreadsheet | N7, N10 | First |
| INV-09 | an administrator | a list of tags for items, kept as the `inventory.tag` vocabulary | costume can be found by period or colour | part 2, item tags | First |

## The catalogue

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| INV-10 | a department lead | to add an item with photos, details and ownership, and get its tag at once | it is on the books and labelled the day it arrives | I1, I2, I9, I11 | First |
| INV-11 | a department lead | to add several alike in one go, or one counted item with a quantity | forty chairs do not take forty forms | I1, I4 | First |
| INV-12 | a department lead | to print labels for one item or a selection, in the size we use | every item carries a scannable tag | part 5, S11 | First |
| INV-13 | anyone with access | to scan a label or type a tag anywhere and land on the item | finding a thing takes one action | part 5, S1 and S17 | First |
| INV-14 | a department lead | to move items and containers between locations | the record matches the shelf | I5, I6 | First |
| INV-15 | a department lead | an items list with filters, search, a right-click menu, and archived and disposed items below the divider | I can work the whole catalogue from one page | I8 | First |
| INV-16 | a department lead | an item page with its inspections, training needs, loans, faults and history | I can answer anything about it without asking | I7, I9, I10 | First |

## Loans

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| INV-17 | a stage manager | to start a pull list from the production's Kit tab, with lines in words before items are found | the department knows what we need early | L2, L5, L6 | First |
| INV-18 | a department lead | to match wanted lines to items, seeing whether each is free for the window | I can promise only what I have | C1 to C6, L6 | First |
| INV-19 | a department lead | to approve a pull list all or none, or decline it with a note | a half-promised list never exists | L4, L7, L17 | First |
| INV-20 | a member | to browse Borrow kit, see what is free on my dates and send a request | I can borrow a costume for a society event | L3, L4, I9 | First |
| INV-21 | a department lead | to lend directly to a visiting company or an outside borrower | a loan I agree on the phone is one step | L3, L4 | First |
| INV-22 | a desk volunteer | to check out by scanning, recording condition and who collects, with training checked at that moment | kit goes only to people trained to use it, and any override is named | L11, L12, K2 to K5 | First |
| INV-23 | a desk volunteer | to return by scanning, partly if need be, marking lost lines and damage | damage is caught when it comes back | L13, L14, L15 | First |
| INV-24 | a borrower | a reminder before my loan is due and, if late, a chase every few days | I return kit on time | R1, R3 | First |
| INV-25 | a department lead | production loans to follow their production's dates, and to be cancelled with a cancelled production | I do not chase kit for a moved show | L9 | First |
| INV-26 | a borrower | to ask for more time, and the approver to extend it if the kit is free | a run extended by a week keeps its kit | L10 | First |
| INV-27 | a member | to see my loans and cancel a request, and my details to be erased once the loan is old enough | I know where I stand and my data is not kept for ever | L1, L16, R5 | First |

## Inspections

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| INV-28 | a technical manager | a list of what is due and overdue by kind, and a weekly digest of it | nothing slips past its test date | N7, R2, R3 | First |
| INV-29 | a trained tester | an inspection session that runs one kind over many items by scanning | a PAT day takes an afternoon, not a week | N2, N5 | First |
| INV-30 | a technical manager | a failed inspection to take the item out of service in the same save | an unsafe lantern cannot go out | N6 | First |
| INV-31 | a technical manager | a pass after a fail to bring the item back, only if nothing else holds it out | an item returns to service exactly when it is safe | N8, F4 | First |
| INV-32 | a technical manager | to correct a wrong result by recording one that supersedes it | the record stays honest and whole | N9 | First |
| INV-33 | a technical manager | to record a contractor's results with their certificate | outside testing counts the same as ours | N5, part 4 file slots | First |
| INV-34 | a department lead | to excuse one item from a kind its category carries, with a reason | the battery torch is not sent for PAT | N3 | First |
| INV-35 | a department lead | to be told when hired-in or borrowed-in kit is due back to its owner | we never pay a late fee by forgetting | R4 | First |

## Faults and disposal

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| INV-36 | any member | to report a fault from a scan, the item page, or a show report's link, saying whether it is unsafe | broken kit is known about the night it breaks | F1 | First |
| INV-37 | a department lead | to repair, write off or reopen faults | the faults list is the repair queue | F2, F3, F4 | First |
| INV-38 | a department lead | to propose a disposal that a second person approves | nothing of value leaves on one say-so | D1, D2, D5 | First |
| INV-39 | a technical manager | a disposal, once done, to cancel future promises, leave its container and stop its inspections | nobody is promised a thing we no longer have | D3, D4, B4 | First |

## Bookable kit, with Spaces

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| INV-40 | an administrator | to make an item bookable in Spaces from its page | members can book the van or the projector like a room | B1, B2; Spaces SP-49 to SP-52 | First, once Spaces' amendments land |
| INV-41 | a department lead | a booking and a loan of the same item never to overlap, whichever is made first | the diary and the store agree | C5, B3, B4 | First, with INV-40 |

## Reporting

| Id | As | I want | So that | Rules | Release |
| --- | --- | --- | --- | --- | --- |
| INV-42 | a finance officer | to export the item list with values, ownership and inspection dates | the insurer gets a schedule in minutes | I9; job `inventory.export-schedule` | First |
| INV-43 | a technical manager | Inventory's five measures in Reports and its cards on the console home | I can see the state of the store at a glance | part 4, measures; part 5, S16 | First |

## Later

| Id | As | I want | So that | Waits on |
| --- | --- | --- | --- | --- |
| INV-44 | a department lead | a stocktake: scan a location and see what is missing or misplaced | the records are checked against the shelves each year | Nothing; first in line after the release |
| INV-45 | a department lead | hire fees and deposits on loans to outside borrowers | lending to other companies pays its way | Companies' settlement charges (CO-44) and Payments (question 1) |
| INV-46 | an outside company | a public hire catalogue | they can see what we lend before asking | INV-45 |
| INV-47 | a wardrobe lead | custom fields per category, such as chest and waist | costume can be found by size | A shared custom fields design (question 8) |
| INV-48 | a technical manager | usage counters and servicing schedules, such as lamp hours | kit is serviced by use, not only by date | Nothing |
| INV-49 | a desk volunteer | a kit desk that works offline and catches up | a get-out in a basement with no signal still records returns | The live shell's offline work |
| INV-50 | a form author | an item picker as a form field type | a hire request form can name the kit | Forms' `forms.field-type` point |
| INV-51 | a finance officer | asset values and depreciation in the ledger | the accounts carry the kit | Finance; question 7 |
| INV-52 | a technical manager | to import an existing spreadsheet of kit | a theatre does not retype its store | Nothing |
| INV-53 | a department lead | to record kit lent to us by a private person | a member's own amplifier is tracked while it is here | A ruling on personal data in ownership (I11) |

## Order of work

1. **Gate:** INV-01 to INV-04, with the lending proof in part 8.
2. **Catalogue:** INV-05 to INV-16. Useful alone: a theatre can label and find its kit.
3. **Loans:** INV-17 to INV-27, production loans first (INV-17 to INV-19, INV-22, INV-23), then members and outside borrowers.
4. **Inspections, faults and disposal:** INV-28 to INV-39, which can run alongside loans.
5. **Reporting:** INV-42 and INV-43.
6. **Bookable kit:** INV-40 and INV-41, once Spaces has SP-49 to SP-52.
