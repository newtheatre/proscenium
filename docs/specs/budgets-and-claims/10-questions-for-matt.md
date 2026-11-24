# 9. Questions for Matt

Eleven decisions. Matt answered questions 2 to 10 on 24 November 2026, each as recommended, so the document already reads to those answers. Questions 1 and 11 stay open: Integration puts them to Matt with its own questions (its 5 and 1).

| # | Question | Recommendation |
|---|---|---|
| 1 | Where do bank details live? | Once, encrypted, in Payments' payee store |
| 2 | When is a claim's cost counted? | **Answered:** at approval |
| 3 | What happens when a claim takes a line over budget? | **Answered:** only the treasurer approves; never refused |
| 4 | Do big claims need two approvers? | **Answered:** a setting, unset by default |
| 5 | Must people ask before spending? | **Answered:** optional; a setting marks claims that didn't |
| 6 | Can an approver pay part of a claim? | **Answered:** yes, per item, with a reason |
| 7 | Who pays NNT's members back? | **Answered:** both routes; the SU by default |
| 8 | When do funding awards to acts arrive? | **Answered:** with the festival release |
| 9 | How long are claims and receipts kept? | **Answered:** six years, a setting |
| 10 | Who holds a production's budget? | **Answered:** its production lead, beside the treasurer |
| 11 | How does Finance gain the new posting kinds? | A purpose column added without a rebuild; no exception to G6 |

## 1. Where do bank details live?

**Options.** (a) Payments' payee store, encrypted, beside the outgoing payment that uses them (agreed with Invoices and exports). (b) A Budgets table of claimants' details. (c) Not stored: the claimant types them on every claim.

**Recommendation: (a).** One place to secure, audit and erase; suppliers and companies paid by Invoices use the same store. (c) is safest but students claim often and mistype account numbers. At NNT, if the SU pays (question 7), nobody's bank details need to be held at all.

## 2. When is a claim's cost counted?

**Options.** (a) At approval: an expense and a debt to the claimant. (b) At payment. (c) Dated on the receipt's date.

**Recommendation: (a).** The budget shows the cost as soon as the theatre has agreed to it, and the debt to the person is visible. (c) breaks on closed periods, since a late claim would post into a period already closed. The receipt date stays on the item for people to read.

**Answered 24 November 2026: (a).**

## 3. What happens when a claim takes a line over budget?

**Options.** (a) Only the treasurer may approve it, with the overspend shown. (b) Anyone who holds the line approves; everyone is warned. (c) Refused until the budget is revised.

**Recommendation: (a).** Old Proscenium's I-201 said "the system notices, humans decide" and never blocks; (a) keeps that while making sure the person who answers for the money decides. (c) leaves a student out of pocket while a committee meets.

**Answered 24 November 2026: (a).**

## 4. Do big claims need two approvers?

**Options.** (a) A setting, unset by default. (b) A setting with a value, such as £250. (c) No.

**Recommendation: (a).** Some parent bodies require two signatures above an amount; the number is theirs. If NNT's SU sets one, tell me the figure and it becomes NNT's value.

**Answered 24 November 2026: (a).** NNT's value stays unset until a figure from the SU is known.

## 5. Must people ask before spending?

**Options.** (a) Optional: claims above a setting are marked "not asked first". (b) Required above an amount: such a claim cannot be submitted without an approved request. (c) No spending requests.

**Recommendation: (a).** Asking first is good practice but a hard rule punishes the person who bought gaffer tape at 6pm before a get-in. The setting is unset by default.

**Answered 24 November 2026: (a).**

## 6. Can an approver pay part of a claim?

**Options.** (a) Yes, per item, with a reason the claimant sees. (b) All or nothing: send it back to be changed.

**Recommendation: (a).** "We'll pay the paint, not the takeaway" is common and sending it back for that wastes a round. Part approval is fixed once made; a claimant who disagrees makes a new claim.

**Answered 24 November 2026: (a).**

## 7. Who pays NNT's members back?

At many students' unions the union pays a society's expense claims from the society's account. I do not know whether NNT's does, or whether NNT pays from its own bank account.

**Options.** (a) The SU pays: default route "parent body", with the schedule download. (b) NNT pays by bank transfer. (c) Both offered, the default (a).

**Recommendation: (c), pending your answer.** It costs nothing extra. Tell me which NNT does and whether the SU has its own claim form; if it does, the schedule download is shaped to it.

**Answered 24 November 2026: (c).** Both routes are offered and NNT's default is the SU. Whether the SU has its own claim form is still to be found out; the schedule download is shaped to it if so.

**What NNT does (Matt, 24 November 2026).** The SU pays members' claims through its own "Expenses" app, where people submit their claims and receipts. So at NNT the parent-body route means this: the claim is still made and approved here, which keeps the budget's spend and four-eyes checks. Then it is handed over, not paid. On approval, the claimant gets a claim pack to submit in the SU app, with the claim summary as a PDF and its receipts. The treasurer marks the claim "submitted to the SU", with the app's reference, and later "paid by the SU". That last step records the outgoing payment from the parent-body balance. The schedule download stays for reconciling with the SU's statement. The SU app has no API that we know of, so nothing is sent to it automatically. Matt also believes NNT is not VAT registered, so BC-45 stays off at NNT (finance.tax.number unset).

## 8. When do funding awards to acts arrive?

**Options.** (a) With the festival release (StuFF's gate), as stories BC-38 to BC-41. (b) In Budgets' first release. (c) Not at all; awards are paid as ordinary claims.

**Recommendation: (a).** Awards matter to festivals (WSAF funds acts) and depend on Companies, which is also new. Nothing in the first release has to change to add them.

**Answered 24 November 2026: (a).**

## 9. How long are claims and receipts kept?

**Options.** (a) Six years after the last event, a setting from 2 to 10. (b) Seven years. (c) Three years.

**Recommendation: (a).** Six years matches the usual UK expectation for accounting records and the old system's sales retention. It is a setting; a parent body that asks for longer sets it. Not legal advice.

**Answered 24 November 2026: (a).**

## 10. Who holds a production's budget?

**Options.** (a) Its production lead (with the team fact), beside the treasurer. (b) The treasurer only. (c) Whoever the treasurer grants, nobody by default.

**Recommendation: (a).** A producer approving their crew's paint is the point of a production budget, and old I-201 wanted producers to see their own figures live. The lead's own claims still go to someone else.

**Answered 24 November 2026: (a).**

## 11. How does Finance gain the new posting kinds?

Budgets and Invoices both need postings Finance cannot name today. `finance_postings.kind` is a CHECK constraint, and SQLite cannot change a CHECK without rebuilding the table. Foundations rule G6 (part 3, and the data-class registry) refuses any migration that rebuilds an append-only table, and NNT's live ledger has rows in it since 19 November 2026.

**Options.**

- (a) **No rebuild: a purpose column.** Add `finance_postings.purpose` with ALTER TABLE ADD COLUMN, checked in `postEntries` against a list Finance owns. These postings use the existing kind `transfer`, disbursements included, since a payout would put the bank on Finance's reconcile screen, and carry the purpose. Keeps G6. The cost: two columns describe a posting, and a report must read `purpose` to tell a claim from any other transfer.
- (b) **No rebuild: existing kinds and the source reference.** Post claims as `transfer` and bills as `correction`, the meaning carried only in `source_module` and `source_type`. Nothing to migrate, but `correction` for a bill misleads anyone reading the ledger, and every report must know each module's source types.
- (c) **An exception to G6, by decision record.** One rebuild that copies every row and swaps the CHECK for a BEFORE INSERT trigger listing the kinds, so later kinds need only a trigger swap. The cleanest ledger, but it breaks a standing rule on the live production ledger, needs your approval and a checked migration (row counts and money totals before and after, one batch).

**Recommendation: (a).** It gives reports a proper field without touching the rule or the live table's rows, and a later kind can still be added the same way. (c) is better only if you would rather have one field than keep G6 unbroken. Integration will put this to you together with spec 9's view.
