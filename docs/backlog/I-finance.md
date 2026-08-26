# Module I: Finance

Every module writes into one append-only ledger; the treasurer reads, and nobody retypes. There
is no online payment and no payment-provider settlement feed: all money is taken in person on the
SumUp reader, so reconciliation is the daily cross-check of the ledger's expected figure against
the reader's Z total, the old estate's model kept and extended. Budgets, expense claims and
settlements extend the same ledger in V2; invoicing for hires and rights waits for its modules.

Stories: 13 (9 MVP, 3 V2, 1 Later).

## Open questions

1. SumUp reader API: if the Phase 0 spike shows the SU's account permits API-initiated reader
   checkouts, per-transaction reader records become available. Does that change the daily Z model,
   or stay a mistype-prevention measure with the typed cross-check as fallback?
2. Historical pass revenue: the old estate never wrote pass-sale transaction rows. Before import,
   the committee must decide once: backfill reconstructed entries from issue records, or write the
   revenue off with a recorded note (I-109).
3. Reconciliation day boundary: the old code computed the Z per calendar London day, but the till
   session and the show night run on the 04:00 boundary. Which boundary does the reader's own Z
   use, and should ours match it?
4. SU nominal codes: who supplies the category vocabulary for export mappings, and is the SU
   return format stable year to year?
5. Variance policy: what variance size demands investigation rather than write-off, and which role
   may write one off?

## I-101: The append-only ledger

- Role: Treasurer
- Phase: MVP
- Story: As the treasurer, I want a single append-only ledger holding every money event in integer pence so that the accounts are a query, never a reconstruction.
- Depends on: none
- Acceptance criteria:
  1. Every ledger entry records an amount in integer pence, an entry type, a source module, a timestamp, the acting user (or system for automated actions), and references to its originating records (booking, bar sale, tab, pass, production where applicable); no floating-point money column exists anywhere in the schema.
  2. The ledger accepts inserts only: UPDATE and DELETE are refused at the database layer by trigger, and an attempted update is a named automated test that must fail.
  3. A correction is a new entry referencing the entry it supersedes; both remain visible, and net positions are computed across the chain.
  4. No report figure is stored: every total is derived from ledger rows at read time, and any cache of a total is invalidated, never authored.
  5. Timestamps are stored in UTC; every day, month and season grouping is computed with Europe/London pinned, and an entry either side of a DST transition groups to the correct London day in a named test.
- Source: Prompt Book I-1, P2, P4; audit PR-12 (on-hand is always a sum, never stored)

## I-102: Every module posts when money moves

- Role: Treasurer
- Phase: MVP
- Story: As the treasurer, I want every money-taking path to post its ledger entry at the moment money changes hands so that the ledger is complete by construction, not by discipline.
- Depends on: I-101; module D (collection and refunds); module F (till and tabs)
- Acceptance criteria:
  1. Ticket collection at the desk posts the entry at collection, never at reservation: collection is the payment boundary, and a reservation contributes nothing to the ledger.
  2. A refund posts a per-ticket refund entry referencing the original entry; the double-refund race is a named regression case (two racing refunds produce exactly one entry).
  3. A bar sale posts its entry in the same transaction as its lines and stock movements; a tab settlement posts on settlement, bounded to the charges it covers, so a charge landing mid-settle stays outstanding.
  4. A pass sale posts an entry at desk issue (closing the old estate's missing pass-sale rows); a pass redemption posts a zero-value admission entry referencing the pass.
  5. Every money-taking screen sends the expected total in pence; a mismatch with the server's computation is a refusal quoting both figures, because a human typed that number into the reader.
  6. No code path records money taken without a ledger write in the same transaction; each money path is enumerated in a checklist test.
- Source: Prompt Book I-1, D-3, F-1; audit PR-5, PR-6, PR-8 (pass-sale defect), PR-12

## I-103: Comps and discounts as visible foregone value

- Role: Treasurer
- Phase: MVP
- Story: As the treasurer, I want comps and discounts recorded as zero-value entries with their foregone value visible so that giveaways are a figure, never a silent gap.
- Depends on: I-101, I-102
- Acceptance criteria:
  1. A comp posts a zero-value ledger entry carrying the full-price lines and the approver's identity; foregone value is reportable per show and per period.
  2. Discounts snapshot the undiscounted price onto the entry so foregone value is computable later without reconstructing price history.
  3. Companion (access) tickets post zero-value entries that appear in finance reports as counts and value only, never with needs or names.
  4. Comp and discount totals appear on the night report and in the daily reconciliation split.
  5. Zero-value entries never move the expected Z figure, and a test asserts a day of comps reconciles to zero.
- Source: Prompt Book I-1 (foregone revenue), D-5; audit PR-5 (comp stores zero with full-price lines), PR-12

## I-104: Daily reconciliation against the SumUp Z

- Role: Treasurer
- Phase: MVP
- Story: As the treasurer, I want the system to compute the exact figure the SumUp Z should read for each London day, and to record a variance when the reader disagrees, so that a discrepancy is a record to resolve, not a suspicion.
- Depends on: I-102, I-103
- Acceptance criteria:
  1. For any London day, the system derives the expected Z figure purely from ledger entries, split by source (desk collections, walk-ups, bar, tab settlements, pass sales) with comps, discounts and refunds itemised.
  2. There is no settlement feed to match against: an authorised person enters the reader's actual Z reading as a daily step, and the entry records who and when.
  3. When expected and actual differ, a variance record is created: date, expected, actual, difference, recorder and a mandatory note; variance records are append-only.
  4. Resolving a variance posts a correction entry or an explicit write-off referencing the variance; a variance is never edited or deleted.
  5. Days with takings but no recorded Z reading surface on the treasurer dashboard until reconciled, and the list is never truncated.
- Source: Prompt Book I-1 (unmatched items surface as exceptions, adapted to the no-PSP constraint), D-3; audit PR-12 (reconciliation split); Get-In constraint 1

## I-105: Treasurer dashboard for the season

- Role: Treasurer
- Phase: MVP
- Story: As the treasurer, I want a season dashboard derived entirely from the ledger so that "how are we doing" is a glance, not a spreadsheet.
- Depends on: I-101, I-104
- Acceptance criteria:
  1. The season runs 1 August to 31 July, Europe/London; the boundary is a named test case, including an entry at 23:59 on 31 July.
  2. The dashboard shows season revenue by source, refunds, foregone comp and discount value, and the open variance total, every figure derived from ledger rows.
  3. Any figure drills down to its ledger entries; entry lists page in SQL and return a pagination envelope, never a bare array.
  4. Periods are selectable (day, week, month, term, season) with grouping pinned to Europe/London.
  5. Visibility is role-scoped: the treasurer and administrators see everything; other committee roles see season aggregates without personal detail.
- Source: Prompt Book I-1, I-3 (role-scoped visibility), P4; audit PR-7 (season 1 August to 31 July)

## I-106: Revenue by show counts collected, unrefunded money

- Role: Treasurer
- Phase: MVP
- Story: As the treasurer, I want a show's revenue to count only collected, unrefunded money so that the reported figure is money the theatre actually holds.
- Depends on: I-102
- Acceptance criteria:
  1. A show's revenue sums collected, unrefunded ticket entries only; reservations and unpaid holds contribute nothing.
  2. Refund entries subtract from the show's reported revenue whenever they post, and the report states the gross, refunded and net figures separately.
  3. Door (walk-up) and pre-booked sales are distinguishable in every per-show report, because the source is recorded at the door in the new model.
  4. Pass-covered admissions report as zero-value admissions against the show; pass revenue reports at pass level with a per-admission utilisation figure, never double-counted into show revenue.
  5. The sum of per-show figures reconciles to the season dashboard total in an automated test.
- Source: Prompt Book I-1, D-7; audit PR-7 (collected unrefunded rule), PR-5 (walk-in source defect), PR-8

## I-107: Period close with locks

- Role: Treasurer
- Phase: MVP
- Story: As the treasurer, I want to close a period with a lock so that reported figures stop moving, and corrections happen in the open period where everyone can see them.
- Depends on: I-101, I-104
- Acceptance criteria:
  1. The treasurer closes a period (term or season); the close records who and when and writes an audit entry.
  2. New entries dated within a closed period are refused; a correction posts as a new entry in the open period referencing the original.
  3. A report over a closed period is stable: re-running it produces identical figures, asserted by a test.
  4. Reopening a closed period requires an administrator and a typed confirmation, and is audited; the close history is visible.
  5. Closing warns of blocking conditions before it proceeds: unreconciled days and open variance records in the period.
- Source: Prompt Book I-1 (period close), P2; audit SD-11 (audit discipline)

## I-108: Exports shaped for SU accounting

- Role: Treasurer
- Phase: MVP
- Story: As the treasurer, I want period exports mapped to the SU's accounting categories so that the union's oversight costs one download.
- Depends on: I-101, I-107
- Acceptance criteria:
  1. Category mappings are configurable: each ledger entry type and source maps to an SU nominal code, managed in the configuration surface (J-104) and audited on change.
  2. A period export produces CSV with date, category, nominal code and amounts in pence (a pounds column is formatted at export time only); output guards CSV formula injection.
  3. Entries whose type has no mapping appear on an explicit unmapped line; the export never drops or hides a row.
  4. The yearly SU return is a saved report, re-runnable identically for any season.
  5. Every export is audited: who, when, which period.
- Source: Prompt Book I-3; audit PR-7 (export caps and formula-injection guard)

## I-109: Historical money imports as opening ledger history

- Role: Treasurer
- Phase: MVP
- Story: As the treasurer, I want six years of the old estate's money imported as opening ledger history so that retention obligations carry and season comparisons do not start from zero.
- Depends on: I-101
- Acceptance criteria:
  1. Proscenium's transaction history imports as ledger entries with original dates and fresh ids; no legacy identifiers enter the live schema (decision 0015, amended), and the six-year sales retention obligation carries through the entries themselves plus the archived old estate.
  2. The documented pre-migration repairs (container sizes, zeroed stocktakes, double-voided tab charges) run before export; the import is checksummed and reconciled by row counts and money totals, and any mismatch aborts the import.
  3. Imported history lands locked: historical periods are closed at import, append-only from that moment.
  4. Pre-migration walk-ins are not reclassified; the data dictionary records the blur and reports label pre-migration door figures accordingly.
  5. Historical pass revenue follows the one-off committee decision recorded before import: reconstructed entries or a written-off note, either way in the ledger.
  6. Anonymised customers import as anonymised; the import can never reintroduce an identifying value.
- Source: Prompt Book I-1, P2; audit PR-8, PR-12 (data-damage record); Get-In part 3 (inventory and repairs)

## I-201: Production budgets and allocations

- Role: Production role
- Phase: V2
- Story: As a producer, I want my show's budget, committed spend and revenue live so that "how are we doing" never waits for the treasurer.
- Depends on: I-101, I-106
- Acceptance criteria:
  1. The committee sets a budget allocation per production in integer pence; allocation changes append with who and when, and history stays visible.
  2. A live view shows allocation, committed, spent and box-office revenue to date, all derived from ledger entries referencing the production.
  3. Visibility is scoped: a producer sees their own production only; the committee sees the season; the treasurer sees everything.
  4. Approved expense claims (I-202) and recharges post against the production's ledger lines and appear in the live view without manual retyping.
  5. Overspend against allocation is a visible warning to the producer and the treasurer, never a block: the system notices, humans decide.
- Source: Prompt Book I-2, P6; audit PR-7; Get-In constraint 2 (budgets precede the production module)

## I-202: Expense claims with receipts and approval

- Role: Production role
- Phase: V2
- Story: As a member who has spent their own money for a production, I want to claim it with a receipt and see the decision so that reimbursement is a process, not a favour.
- Depends on: I-101, I-201
- Acceptance criteria:
  1. A claim records amount in pence, category, the production or department it belongs to, and a required receipt image; receipts are access-controlled.
  2. Claims route to the treasurer (or a configured approver) for approval or decline; a decline requires a reason the claimant sees.
  3. Approval posts the expense to the ledger against the production's lines; the reimbursement handover is recorded as its own entry when it happens, and the system records money, it never moves it.
  4. Claims are append-only: a mistake is voided with a reason and re-submitted, never edited.
  5. Two racing approvals resolve to one: the loser receives a conflict and no duplicate entry is written.
- Source: Prompt Book I-2, P2, P6; audit PR-6 (concurrent-mutation discipline)

## I-203: Settlement reports and the season closing checklist

- Role: Treasurer
- Phase: V2
- Story: As the treasurer, I want a frozen settlement report per production and a season closing checklist that surfaces unsettled tabs so that closing the year is a procedure, not archaeology.
- Depends on: I-107, I-201, I-202; module F (tabs)
- Acceptance criteria:
  1. At close-of-run, settlement compiles a production's revenue, costs, comps and contribution into a frozen report; re-rendering it later produces identical figures.
  2. The settlement report feeds the season accounts, and production-scoped roles end at settlement.
  3. The season closing checklist lists every unsettled bar tab with holder and outstanding pence; season close is blocked until each is settled or explicitly written off, and a write-off posts an audited ledger entry.
  4. The checklist also lists unreconciled days and open variance records for the season.
  5. Completing the checklist and closing the season locks the period (I-107) in the same action.
- Source: Prompt Book I-2, F-1 (unsettled tabs land on the closing checklist), P3; audit PR-12 (tab semantics)

## I-301: Hire and rights invoicing

- Role: Treasurer
- Phase: Later
- Story: As the treasurer, I want external hire invoices and rights fees to post into the same ledger so that non-box-office money keeps the same discipline when its modules arrive.
- Depends on: I-101; module C (external hires, Later); module B (rights, Later)
- Acceptance criteria:
  1. A confirmed external hire generates an invoice recorded against the ledger; payment is recorded when taken through an SU-sanctioned flow, never initiated by the system.
  2. Rights fees link from a production's rights record to cost entries in the ledger.
  3. The MVP ledger schema leaves the entry-type and source vocabularies extensible so these entry types require no schema rework.
- Source: Prompt Book I-1 (hire invoices and fees), B-4, C-4; Get-In constraint 2
