# 5. Screens

Inventory has 17 screens: 11 in the console, 3 in the members' area, and 3 things it adds to pages other modules own. All are Nuxt UI v4 and follow the list design already agreed: archived and disposed rows sit below a collapsible divider, search is an icon beside New, rows have a right-click menu, and toasts offer Undo. Primary buttons keep the default colour. A setting appears on the page it governs or in the cog modal, never both (part 6).

## Menus and names

- **Console:** "Inventory", with Items, Loans, Kit desk, Inspections, Faults and Disposals beneath it. Each person sees only the entries their abilities open; a wardrobe lead with a grant on Costume sees Costume's items and loans and nothing else.
- **Members' area:** "Borrow kit", shown when `inventory.catalogue.members-browse` is on and the person holds `inventory.loan.request`. Question 9 asks about both names.
- Every string goes through `t()`. The words in this tab are the proposed English.

## The screens

| # | Screen | Address | Who sees it | What it does |
| --- | --- | --- | --- | --- |
| S1 | Items | `/console/inventory` | `inventory.item.view` on any department | Tag, name, category, location, state, next inspection, on-loan badge. Filters for department, category, location, state, lendable, tag and "inspection due". Typing or scanning a tag into search opens that item. Right-click: Open, Print label, Report a fault, Move, Withdraw. Disposed items sit below the divider. |
| S2 | Item page | `/console/inventory/items/[id]` | `inventory.item.view` | Wireframe 1. Replacement value, owner and serial number show only to holders of `inventory.item.edit` or `inventory.item.export` (I9). |
| S3 | Add item | `/console/inventory/items/new` | `inventory.item.edit` | Category first; its inspections and training needs are shown read-only with a link. "Add several" makes a run of identical individual items with consecutive tags, or one counted item with a quantity. |
| S4 | Loans | `/console/inventory/loans` | `inventory.loan.view` | Tabs for Requests, Approved, Out and Overdue; finished loans below the divider. Production or borrower, department, window, number of lines, state. |
| S5 | Loan page and pull list | `/console/inventory/loans/[id]` | `inventory.loan.view`; editing by the owner while a draft, or `inventory.pull-list.edit` | Wireframe 2. One page from first request to return. |
| S6 | Kit desk | `/console/inventory/desk` | `inventory.loan.issue` | Wireframe 3. Check-out and return by scanning, in the live mode shell. |
| S7 | Inspections due | `/console/inventory/inspections` | `inventory.inspection.record` | Grouped by kind, overdue first. "Start a session" runs one kind over many items, such as a PAT day: scan, result, readings, next. A contractor's certificate can be attached once for the session. |
| S8 | Faults | `/console/inventory/faults`, and `/new?production=<id>` | List: `inventory.fault.manage`. New: `inventory.fault.report` | Open faults by department, oldest first. The new-fault form takes a scan or a search, a description, up to four photos and "Unsafe to use", which takes the item out of service in the same save. Show reports link here with the production filled in. |
| S9 | Disposals | `/console/inventory/disposals` | `inventory.disposal.approve` | Proposals waiting, with value, method and reason. Approve or decline with a note. The proposer cannot approve their own, except an owner. |
| S10 | Inventory setup | Cog modal on S1, and Admin > Modules > Inventory | `inventory.setup.manage`, `inventory.settings.manage` | Departments, categories (with their inspection kinds and training needs), the locations tree (drag and drop with @dnd-kit/vue), inspection kinds, tags, and the settings in part 6. |
| S11 | Labels | `/console/inventory/labels?items=…` | `inventory.item.view` | A print sheet in the size set by `inventory.labels.size`: QR code, tag, name and department. Reached from S1's selection, S2 and S3. |
| S12 | Borrow kit | `/members/kit` | `inventory.catalogue.browse` | Lendable items with their first photo, grouped by department. Choosing dates shows what is free then. "Add to request" builds a basket. |
| S13 | Request kit | `/members/kit/request` | `inventory.loan.request` | Dates, purpose and the basket. Sends a requested loan to the department. One department per request; a mixed basket becomes one request per department, said before sending. |
| S14 | My loans | `/members/kit/loans`, `/members/kit/loans/[id]` | The loan's owner | State, dates and lines, read-only. "Ask for more time" and, while requested, "Cancel request". |
| S15 | Kit tab on a production | Production record, tab "Kit" | `inventory.loan.view` or `inventory.pull-list.edit` | This production's pull lists, one per department, with "Start a pull list". The record fact reads, for example, "Kit: 34 out, 2 overdue". |
| S16 | Home cards | Console home | `inventory.loan.issue`, `inventory.inspection.record` | "Due back today", "Overdue" and "Inspections due this week", each a count linking to its list. |
| S17 | Quick action and search | Everywhere | `inventory.item.view` | Quick action "Find kit" opens the camera or a tag box. Search finds items by tag and name. |

## Item page

(Diagram in the Claude Doc: https://claude.ai/artifact/3H4CVrVcLN1aDku92AmXit) Wireframe 1 · item page

The page answers four questions without a click: what it is, where it is, whether it is safe to lend, and who has it. Buttons appear by ability, so a volunteer with only `inventory.fault.report` sees "Report a fault" and nothing else. Training needed lists what `core.requirement` will be asked at lending; whether the reader holds it is not shown here. A counted item shows quantity on hand, out and lost in place of "Now at".

## Loan page and pull list

(Diagram in the Claude Doc: https://claude.ai/artifact/3H4CVrVcLN1aDku92AmXit) Wireframe 2 · loan page with its pull list

A production's stage manager starts the pull list from the production's Kit tab. Lines begin as "wanted", in words, and become "listed" when an item is matched; the "Free then?" column asks the same predicate the write will ask. Approval is all or none (rules C1 to C6). The same page carries the loan through issue and return: once approved the lines show promised, out, returned or lost, with condition each way. A member's loan uses the same page without the production line; the borrower sees it read-only in My loans.

## Kit desk

(Diagram in the Claude Doc: https://claude.ai/artifact/3H4CVrVcLN1aDku92AmXit) Wireframe 3 · kit desk in check-out mode

The desk uses the live mode shell (`layouts/live.vue`, PR 179), as the bar does. A barcode scanner works as a keyboard; on a phone, the camera reads the QR code. Scanning a loan number or any item on a loan opens that loan. In Return mode each scan asks for condition and, for a counted line, how many came back; "Damaged" opens a fault in the same save. A refusal names its reason (not on this loan, overdue inspection, out of service, missing training). Only a holder of `inventory.requirement.override` sees Override, which asks them to sign in again and give a reason, and is audited.

## Empty states and first run

- **No items yet:** "No kit yet. Add your first item, or set up departments and categories first." with both buttons.
- **Setup step:** the module adds a `core.setup-step`, "Set up kit departments and a store", done when one department and one location exist.
- **Nothing due:** "No inspections due in the next {inventory.inspections.remind-before}." quoting the setting.
- **Members with nothing lendable:** "Nothing is available to borrow at the moment."
