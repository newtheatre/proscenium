# 6. Settings and abilities

Inventory declares 13 settings, 16 abilities, 8 record types and no facts, in the formats of Foundations 02-2 and 02-3. Every number below is a proposed default for the workshops to confirm; none is guessed where a theatre must choose, and the two retention periods were decided by Matt (question 10).

## Settings

All are changed by `inventory.settings.manage`, shown in the cog modal on Items and under Admin > Modules > Inventory, and read by staff only unless the row says otherwise.

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `inventory.loans.default-length` | duration | 14d | 1d to max-length | `inventory.settings.manage` | signed-in | Yes | The window offered to a member or outside borrower who gives no end date |
| `inventory.loans.max-length` | duration | 120d | 1d to 365d | `inventory.settings.manage` | signed-in | Yes | Longest window any loan may have; the write refuses a longer one |
| `inventory.loans.production-grace` | duration | 7d | 0d to 60d | `inventory.settings.manage` | staff | No | Days after a production's last performance that its kit is due back (L9) |
| `inventory.loans.remind-before` | duration | 2d | 0d to 14d | `inventory.settings.manage` | staff | No | When the borrower is reminded before the due date; 0 sends none |
| `inventory.loans.overdue-every` | duration | 3d | 1d to 30d | `inventory.settings.manage` | staff | No | How often an overdue loan is chased, borrower and department both |
| `inventory.loans.keep-for` | duration | 2y (question 10) | 90d to 7y | `inventory.settings.manage`, with confirmation | staff | No | How long a finished loan keeps the borrower's details before they are erased (R5) |
| `inventory.inspections.remind-before` | duration | 30d | 1d to 90d | `inventory.settings.manage` | staff | No | How far ahead the weekly inspections digest looks |
| `inventory.inspections.first-due` | choice | `on-adding` | `on-adding`, `after-interval` | `inventory.settings.manage` | staff | No | Whether a new item is due its first inspection at once or one interval after it was added (N4) |
| `inventory.faults.keep-for` | duration | 2y (question 10) | 90d to 7y | `inventory.settings.manage`, with confirmation | staff | No | How long a closed fault's description and photos are kept (R5) |
| `inventory.disposals.approve-above` | money | 0 | 0 to 1000000 | `inventory.settings.manage`, with reason | staff | No | A disposal of an item worth more than this needs a second person's approval; 0 means every disposal does (D2) |
| `inventory.catalogue.members-browse` | boolean | true |  | `inventory.settings.manage` | signed-in | No | Whether members see Borrow kit at all |
| `inventory.labels.size` | choice | `small` | `small` (38 by 21 mm), `large` (63.5 by 38.1 mm) | `inventory.settings.manage` | staff | No | Label sheet layout for S11 |
| `inventory.hired-in.remind-before` | duration | 7d | 1d to 60d | `inventory.settings.manage` | staff | No | When the department is reminded that hired-in or borrowed-in kit is due back to its owner |

Shortening either keep-for asks for confirmation and states how many records the next nightly run will erase. Per-department overrides are not offered: one theatre, one policy.

## Abilities

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `inventory.catalogue.browse` |  | normal |  |  | See lendable items and when they are free, without values or loan details | Every member, when members-browse is on |
| `inventory.loan.request` |  | normal |  | `catalogue.browse` | Ask to borrow kit for oneself | Every member |
| `inventory.item.view` | `inventory.department` | normal |  | `catalogue.browse` | See every item of a department, its history, inspections and faults | Technical manager; department leads; production leads |
| `inventory.item.edit` | `inventory.department` | normal |  | `item.view` | Add, change, move, tag and withdraw items; see replacement values | Technical manager; department leads |
| `inventory.item.export` | `inventory.department` | normal |  | `item.view` | Download the item list as a spreadsheet (job `inventory.export-schedule`) | Technical manager; finance officer |
| `inventory.loan.view` | `inventory.loan` | privileged, `fresh: false`, `audit: 'read'` | grants | `item.view` on the loan's department | See loans and the borrower's name and contact | Department leads; the borrower, by ownership |
| `inventory.loan.approve` | `inventory.loan` | normal | refuses | `loan.view` | Approve or decline a requested loan, promising its lines | Department leads |
| `inventory.loan.issue` | `inventory.department` | normal |  | `loan.view` | Work the kit desk: check out and return | Department leads; store volunteers |
| `inventory.requirement.override` | `inventory.department` | privileged | refuses | `loan.issue` | Lend an item to someone who lacks its training, with a reason | Technical manager |
| `inventory.pull-list.edit` | `core.production` | normal |  | `catalogue.browse` | Start and change a production's pull lists before approval | Production lead; stage managers, by the production team fact |
| `inventory.inspection.record` | `inventory.department` | normal |  | `item.view` | Record inspections and run inspection sessions | Technical manager; trained testers |
| `inventory.fault.report` |  | normal |  |  | Report a fault on any item found by tag | Every member |
| `inventory.fault.manage` | `inventory.department` | normal |  | `fault.report`, `item.view` | Repair, write off or reopen faults; take items out of service by hand | Department leads |
| `inventory.disposal.approve` | `inventory.disposal` | privileged | refuses | `item.view` on the item's department | Approve or decline a proposed disposal | Technical manager; finance officer |
| `inventory.setup.manage` |  | privileged |  |  | Departments, categories, locations, inspection kinds and tags | Technical manager |
| `inventory.settings.manage` |  | privileged |  |  | The settings above | Technical manager; administrator |

Proposing a disposal needs `inventory.item.edit`; approving one is refused to its proposer (owner `proposed_by`), except an Owner. Approving a loan is refused to its responsible person, so nobody approves their own request: a holder who makes a loan with themselves as the responsible person makes it Requested, not Approved (L4).

## Record types

| Record type | Table | Parent | Owner |
| --- | --- | --- | --- |
| `inventory.department` | `inventory_departments` |  |  |
| `inventory.category` | `inventory_categories` | `inventory.department` |  |
| `inventory.item` | `inventory_items` | `inventory.category` |  |
| `inventory.location` | `inventory_locations` | `core.venue`, optional |  |
| `inventory.loan` | `inventory_loans` | `inventory.department` | `responsible_account_id` |
| `inventory.inspection-kind` | `inventory_inspection_kinds` |  |  |
| `inventory.fault` | `inventory_faults` | `inventory.item` |  |
| `inventory.disposal` | `inventory_disposals` | `inventory.item` | `proposed_by` |

A grant on a department reaches its categories, items, faults, disposals and loans. Inventory contributes a resolver for each to `core.record-resolver`.

## Facts

None. Inventory relies on two facts other modules declare: Productions' production team fact for `inventory.pull-list.edit`, and Training's competencies, which are asked through `core.requirement` at lending and are never a grant.

## Presets

| Preset role | Abilities suggested |
| --- | --- |
| `technical-manager` | The module, site-wide |
| `production-lead` | `inventory.item.view`, `inventory.pull-list.edit` |
| `finance-officer` | `inventory.item.export`, `inventory.disposal.approve` |
| `administrator` | `inventory.settings.manage`, `inventory.setup.manage` |
| `volunteer` | `inventory.fault.report`, `inventory.loan.request` |
| `visiting-company` | `inventory.pull-list.edit` on their production |

Department leads (wardrobe, props, set) have no preset: a theatre grants `inventory.item.edit`, `inventory.loan.approve`, `inventory.loan.issue` and `inventory.fault.manage` on one department, which is the point of departments.

## Starting lists

Made by the setup step, each editable and archivable afterwards.

- **Departments:** Props (tag prefix PRP) and Costume (CST), lending to members; Set (SET) and Technical (TEC), lending to productions only (question 2).
- **Inspection kinds:** PAT test, every 12 months, certificate optional, contractor allowed, blocks lending when overdue. Visual check, every 3 months, no certificate, blocks when overdue. Lifting equipment examination, every 6 months, certificate required, contractor allowed, blocks when overdue. Flame-retardancy check, every 12 months, certificate optional, blocks when overdue.
- **Categories:** none. Too theatre-specific to guess; the empty state points to setup.
- **Tags:** none.
