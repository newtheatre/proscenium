# ADR-0030: A tab is a sale on credit; settlement is its own card transaction

**Status:** Accepted · **Date:** 2026-08-22 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

The bar is sometimes open with nothing on: members or committee studying in the foyer want a
snack. Today that is a paper book, committee-only, where you write down what you took, reconciled
at the end of term. The book exists because the SumUp reader is not always to hand and not
everyone can operate it, not because anyone wants a book.

The money record ([ADR-0023](./0023-money-taken-is-recorded-as-a-transaction.md)) knows exactly
two tenders, `CARD` and `COMP`, and has no notion of anyone owing anything. Something has to
represent a sale that has happened but has not been paid for.

## Decision

**A tab charge is an ordinary transaction with `tender = 'TAB'`.** It has real `BAR_ITEM` lines,
real `SALE` stock movements, `taken_on` set to the charge day, and `tab_debtor_user_id` naming who
owes. `source` is `SELF_SERVE` when someone logs their own snack and `TILL` when the counter puts
a round on somebody's tab.

**Settlement is a separate `CARD` transaction** carrying one `TAB_SETTLEMENT` line with no
product, no reservation and no performance. The settled charges are stamped with `tab_settled_at`
and `tab_settlement_transaction_id`. Product reports read `kind = 'BAR_ITEM'` and see the sale
once, on the charge day; the reconciliation sees the money once, on the settlement day. No new
tender: the reader takes it, exactly as [ADR-0024](./0024-sumup-stays-a-manual-reader.md) requires.

**Settlement clears a person's whole balance as at a timestamp**, never a chosen list of charges.
An id list is the shape [ADR-0006](./0006-d1-bound-parameter-limit.md) forbids, and a predicate
makes a concurrent double-settle a no-op instead of a race. Disputing a single charge is what the
void is for ([ADR-0031](./0031-a-tab-charge-is-the-only-voidable-transaction.md)).

**A tab may never carry a ticket line.** `TICKET_PAYMENT` and `WALK_UP` flip a reservation to
`COLLECTED`, which is the payment boundary
([ADR-0011](./0011-collection-is-the-payment-boundary.md)); putting that on credit would mark a
booking paid for money nobody has taken. `buildTransaction()` refuses it, not just the route.

**Alcohol only when staffed.** The self-service screen offers non-age-restricted products only,
and the server refuses an age-restricted product on a `SELF_SERVE` charge rather than relying on
the filtered menu. Age-restricted items reach a tab only through the counter till, where the
training gate and the Challenge 25 flow already apply.

**Who may run a tab is a new permission, `bar.tab`,** carried by a new `COMMITTEE` role and by
`MANAGER` and `ADMIN`. It carries neither `staff.access` nor `foh.work`, so it is not a way into
anything else, which is why the self-service screen lives at `/bar/tab` and not under `/foh`.

## Alternatives considered

- **A separate tabs table.** A second ledger of money owed, reconciled against the first. Every
  question then has two answers and the reports have to be taught which one to trust. A tab is a
  sale; the sales ledger should hold it.
- **Settlement as a new tender, or as an edit to the original charge.** Both hide the money from
  the day it was actually taken, which is the one day the SumUp Z-total can check it.
- **One transaction, marked paid later.** Tempting and wrong: `taken_on` would have to mean two
  different days at once, and the two-lens rule in [13-bar-design §4.5](../13-bar-design.md) breaks.
- **Self-service alcohol.** No ID check and no trained server. Not a close call.

## Consequences

- **Sales and cash split across a term boundary.** A tab charged in one term and settled in the
  next is in the first term's sales and the second term's SumUp totals. The reconciling figure is
  the outstanding balance, which `/admin/bar/tabs` reports; the Treasurer needs it at each end of
  a term, not as a footnote.
- The reconciliation gains two figures, `tabChargedPence` (not in today's Z) and `tabSettledPence`
  (in it). The identity to check is
  `expectedZPence == cardBar + cardTickets + tabSettledPence - discountPence - refundedPence`.
- `tabChargedPence` sums `total_pence` per transaction, not line amounts the way comps do. A comp
  figure is gross; a debt is net of any discount chip.
- **The till lists names rather than asking for an email.** The local mirror holds no roles, so
  the holder list is read from stage-door's `GET /api/role-holders`, scoped to this app's own
  namespace, behind a seam that caches for ten minutes and degrades to the email lookup when
  stage-door cannot answer. The same seam refuses a debtor who is not on the list, which is what
  makes `bar.tab` mean something at the till and not only on the self-service screen.
- **The refusal is fail-soft on purpose.** When stage-door cannot be reached the till is trusted
  exactly as it was before, because a bar that cannot sell is a worse outage than a tab opened for
  the wrong person, and every tab is attributed either way.
- A tab can only be opened for someone who has signed in to Proscenium at least once, because the
  debtor is a restricted foreign key onto the mirror.
- An account erased with an unsettled tab keeps the debt against an anonymised row. Settle or void
  before erasing; the estate orchestrates erasure and this app cannot refuse it.
