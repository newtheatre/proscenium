# Inventory: module specification

2026-11-23 · Matthew Adcock

Inventory is a new switchable module, `inventory`, that keeps a theatre's props, costume, set and technical kit: what it owns, where each thing is, who has borrowed it, whether it is safe to use, and when it leaves for good. It requires only core and is third-round spec 11 of 15. Story ids start at INV-01; id prefixes start `k`. The gate is built; part 12 says how.

## The design in eight sentences

1. Every thing is an **item** with a short tag printed as a QR label, in a **category** under a **department** (Props, Costume, Set, Technical), stored at a **location** that may sit in a core venue or space.
2. Departments are the unit of authority: a grant on Costume lets the wardrobe lead run costume and nothing else, and every loan draws from one department.
3. A **loan** lends items to a production, a member or an outside borrower for a window of time, and the write itself refuses a second loan of the same thing over the same time, counting for things kept by quantity.
4. A production's **pull list** is a loan in the making: lines are matched to items or still wanted, and it becomes the loan when the department approves it.
5. Check-out and return happen at the **kit desk** by scanning labels, recording condition each way; damage on return opens a **fault**.
6. **Inspection kinds** such as PAT testing attach to categories with an interval; each item carries its next due date, a failed inspection takes it out of service in the same save, and an overdue one stops it going out.
7. Training requirements on a category or item are asked through `core.requirement` at the moment of lending, so untrained people cannot take a smoke machine or rigging kit without an audited override.
8. Spaces can make an item bookable; Spaces keeps that diary, Inventory keeps loans, and each side's write carries the other's "is it free" predicate so a booking and a loan can never overlap.

## The parts

| Tab | Holds | Size |
| --- | --- | --- |
| 1. Scope | What is in and out, what it assumes of others, 27 words it owns | 9 exclusions, 27 words |
| 2. Data model | Every table in the Foundations layout, with erasure and merge | 14 tables, 11 id prefixes |
| 3. States and rules | Every life cycle drawn, and every rule with an id | 5 diagrams, 68 rules |
| 4. Interface | Manifest, services, the one point it declares, contributions, events, and what is asked of other modules | 1 point declared, 4 amendments asked of Spaces |
| 5. Screens | Console, members' area and record tabs, with three wireframes | 17 screens |
| 6. Settings and abilities | Settings, abilities, record types, presets and starting lists | 13 settings, 16 abilities, 8 record types |
| 7. Stories | INV-01 to INV-53 with an order of work | 4 gate, 39 first release, 10 later |
| 8. Test plan | The lending proof, then unit, integration and end-to-end cases | 6 proof runs, 52 named cases |
| 9. Questions for Matt | Each with options and Matt's decision | 10 questions, all decided |

## What it rests on

| Source | Used for |
| --- | --- |
| Foundations, and `docs/kit/README.md` on `next` | Table layout, data classes, abilities format, `core.requirement`, unit of work, id prefixes |
| Spaces and room booking | Bookables, the clash rule and its proof, the shape of the four amendments asked of it |
| Training records, and Training (amended) | Competencies as requirement references; agreed in thread on 23 November 2026 |
| Productions, Companies, Governance, Reports | Boundaries agreed by message on 23 November 2026 (part 4 lists each) |
| Bar | The bar's stock locations (optional venue or space), the word "stock" left to the bar |
| Design paper, catalogue and roadmap | The four catalogue lines and roadmap phase 6, "Wider adoption" |

## Where the catalogue's four lines went

| Catalogue line | In this specification |
| --- | --- |
| A catalogue of props, costume, set pieces and technical equipment, with photographs and storage locations | First release: items, departments, categories, locations, photos, labels |
| Loans to productions and outside borrowers, with due dates, deposits and condition on return | First release, without money: deposits and hire fees are later, through Companies' settlements (question 1) |
| Maintenance and inspection records, such as electrical testing, with expiry reminders | First release, as inspection kinds and faults. The word "maintenance" is avoided because `maintenance` is already a module id (site maintenance mode) |
| Write-off and disposal | First release, with a second person approving |

## Open before it can be called settled

- Ten questions for Matt (tab 9): all decided on 24 November 2026, each as recommended.
- Four amendments to Spaces, recorded by Integration as pending (part 4). Until they land, an item cannot be made bookable and stories INV-40 and INV-41 wait.
- The module ids `productions`, `companies` and `governance` must be reserved before Inventory's `uses` may name them.
- The lending proof (tab 8) has not been run.
