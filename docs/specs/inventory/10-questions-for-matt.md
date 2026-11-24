# 9. Questions for Matt

Ten questions, all decided by Matt on 24 November 2026 by question card, each as recommended. Question 5 was asked as two cards: who owns the pull list (Inventory) and what it is called ("Pull list"). The decisions are already written into parts 1 to 8; each question is kept here with its reasoning as the record of why, and under each heading "Recommendation" is the decision.

| # | Question | Decision | Where it shows |
| --- | --- | --- | --- |
| 1 | Do loans take money: hire fees, deposits, charges for damage? | Not in the first release; later through Companies and Payments | Scope, INV-45, INV-46 |
| 2 | Can members borrow kit for themselves? | Yes. Borrow kit is on, and each department chooses whether it lends to members | L3, S12 to S14, INV-20 |
| 3 | Does an overdue inspection stop an item going out? | Yes, for all four starting kinds; each kind can be switched | N7, part 6 |
| 4 | Can a counted item be inspected? | Yes, as a batch; anything that needs a record per unit, such as a PAT-tested lead, is added as individual items | Part 2, N1, S3 |
| 5 | Who owns a production's pull list, and is it called that? | Inventory owns it; Productions shows it on the Kit tab; the word stays "pull list" | L5, S15, part 4 |
| 6 | Can one loan draw from several departments? | No. One department per loan; a mixed basket becomes one request per department | L2, S13 |
| 7 | Are replacement values money in the accounts? | No. A staff-only valuation for insurance; asset values in the ledger are later | I9, INV-42, INV-51 |
| 8 | How are costumes found by size? | Tags first; custom fields per category later | Part 2, INV-47 |
| 9 | What is the module called in the menus? | "Inventory" in the console, "Borrow kit" in the members' area | Part 5, glossary |
| 10 | How long are loans and faults kept before personal details are erased? | Two years after they finish | Part 6, R5 |

## 1. Do loans take money?

**Recommendation: not in the first release.** Hire fees, deposits and damage charges come later (INV-45) as charges on a Companies settlement, for visiting and hiring companies, or as a sale through Payments for anyone else. Inventory never writes to the ledger.

- **For.** Most lending is internal: to the theatre's own productions and members, where nobody pays. Money brings refunds, deposits held over months and disputes, which Companies and Payments already handle.
- **Against.** A theatre that hires kit out commercially from day one would keep fees elsewhere until INV-45.
- **The other option.** A fee and a deposit on the loan itself, paid at the kit desk. It would duplicate Payments' work and need its own refunds.

## 2. Can members borrow kit for themselves?

**Recommendation: yes, department by department.** `inventory.catalogue.members-browse` is on, and each department's `lends_to` decides. The starting departments lend Props and Costume to members, and Set and Technical to productions only.

- **For.** Costume for a society social or a student film is a common ask, and today it happens by message and memory.
- **Against.** More requests for department leads to answer. A department that does not want them simply stays at productions only.
- **The other option.** Productions only, everywhere. Simpler, and members keep asking by message.

## 3. Does an overdue inspection stop an item going out?

**Recommendation: yes, for all four starting kinds.** An item overdue on a blocking kind cannot be promised for a window starting after the due date, checked out or booked (N7). Each kind has the switch.

- **For.** The point of recording PAT and lifting examinations is that untested kit does not reach a stage. A warning nobody has to act on is ignored by the third week.
- **Against.** A busy get-in finds a lantern a day overdue. The answer is the inspections list's warning, which looks 30 days ahead, and a quick test; there is no override for an overdue inspection.
- **The other option.** Warn only. Safer for the schedule, weaker for safety.

## 4. Can a counted item be inspected?

**Recommendation: yes, as a batch.** A counted item, such as 20 lengths of rope, may carry a kind; one inspection covers the batch and a fail takes the batch out. Anything that needs its own record, such as each PAT-tested lead, is added as individual items, which "Add several" makes quick.

- **For.** Keeps one simple rule for every item, and fits how batch checks are done.
- **Against.** A batch with one bad length is out until it is split. Splitting is editing the quantity and adding the bad one as its own item.
- **The other option.** Refuse kinds on counted items. Cleaner records, but forces tags on rope and drapes.

## 5. Who owns a production's pull list, and is it called that?

**Recommendation: Inventory owns it, and it stays "pull list".** It is a loan in the making (L5), so its lines, promises and returns are Inventory's. Productions shows it through the Kit tab and record fact. Productions asked whether the word clashes with anything of theirs; nothing found so far.

- **For.** One place decides whether a thing is free. A pull list in Productions would need to call Inventory for every line anyway.
- **Against.** A stage manager works in two modules' screens. The Kit tab sits on the production, so it does not feel like two.
- **The other option.** "Kit list" or "props list". "Pull list" is the common theatre term and covers costume and technical too.

## 6. Can one loan draw from several departments?

**Recommendation: no.** One department per loan (L2). A production has one pull list per department, shown together on its Kit tab; a member's mixed basket is split into one request per department before sending.

- **For.** Each department approves its own kit without waiting on another, and a grant on a department means exactly what it says.
- **Against.** A borrower may get two answers at different times.
- **The other option.** One loan with lines approved by each department. Partial approval of one loan is the half-promised state the gate exists to prevent.

## 7. Are replacement values money in the accounts?

**Recommendation: no.** A replacement value is a staff-only valuation for the insurance schedule (I9, INV-42), never a ledger entry. Asset values and depreciation are later (INV-51), with Finance.

- **For.** Most student and amateur theatres do not capitalise kit, and a wrong value in a ledger is worse than none.
- **Against.** A theatre that does capitalise keeps that work in its accounts package until INV-51.
- **The other option.** Purchase cost and depreciation from the start.

## 8. How are costumes found by size?

**Recommendation: tags first, custom fields later.** Tags such as "chest 40" or "size 12" work in the first release. Custom fields per category (INV-47) wait for a design shared with other modules.

- **For.** No new machinery, and tags already filter.
- **Against.** Tags cannot answer "chest between 38 and 42".
- **The other option.** Size columns on items now. They fit costume only and would be wrong for every other department.

## 9. What is the module called in the menus?

**Recommendation: "Inventory" in the console and "Borrow kit" in the members' area.** In Admin, departments are labelled "Kit departments", so they are not confused with Budgets' departments.

- **For.** "Inventory" is what staff call the list; "Borrow kit" says what a member can do.
- **Against.** "Inventory" can suggest the bar's stock. The bar keeps the word "stock" for its own.
- **The other option.** "Kit store", or "Stores", for both.

## 10. How long are loans and faults kept?

**Recommendation: two years after they finish**, then personal and free-text columns are erased and the rows stay (R5). Both are settings with confirmation.

- **For.** Long enough to answer "who had the hazer last spring" and to cover an insurance claim; short enough to meet data-protection minimisation.
- **Against.** An old fault's description is useful for an item's whole life. The item's events keep that a fault happened, and its repair, without the words.
- **The other option.** One year, or the life of the item.
