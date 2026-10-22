# 0192: A played night stays off sale, and a cancelled one leaves the count

- Status: Proposed
- Date: 2026-10-22
- Amends: what the publish cascade and On sale act on (D-121 criterion 2), and what the show's figures count (D-132 criterion 2)

## Context

Driving the programme on an empty database found four ways the performance screens said
something untrue:

- A performance added yesterday was put on sale, and stayed "Played" with an Off sale button. The
  publish cascade would have done the same to every past night of a show added to record history.
- Two shows were booked into New Theatre at 19:30 on the same night with no word.
- Cancelling a performance holding only unpaid bookings said three tickets were to refund at the
  desk, although nobody had paid.
- The show's status strip, the shows list and the Sales tab kept counting the cancelled night's
  seats as sold and unpaid, against a house that had already left it out.

## Decision

- **A played night never goes on sale.** `POST /api/admin/performances/[id]/sale` refuses On sale
  for a performance whose show night (0014) is over, and the publish cascade only reaches DRAFT
  performances from the start of tonight's show night. Taking one off sale is still allowed. The
  form warns, without refusing, when a curtain being added or moved is already past: recording
  history is legitimate.
- **A clash is named, not refused.** Adding or moving a performance answers `clashes`: up to
  three non-cancelled performances, any show's, in the same venue whose time overlaps (two hours
  standing in for an unknown running time). The toast names them. A double bill or a get-in can
  share a house on purpose, so this is a warning.
- **Refunds due are paid seats.** A cancellation's `ticketsOwedARefund` counts unrefunded tickets
  on COLLECTED or DOOR reservations with a price above nought that are not on a pass
  (`paidSeatsSubquery`). An unpaid hold, a pass seat and a comp owe nothing back.
- **A cancelled night leaves the show's figures.** The show's unpaid count and a new
  `houseTickets` (sold on performances still going ahead) skip cancelled performances, and the
  strip and the shows list measure `houseTickets` against the house. `soldTickets` still counts
  everything, because it is what decides whether a show may be deleted. The Sales tab leaves a
  cancelled row out of its totals and reads "Cancelled" for its capacity.

## Consequences

- Unpaid holds on a cancelled performance stay PENDING rows; they are no longer reported as
  money owed or as seats awaiting payment. Cancelling them as well is a separate decision, since a
  pass-backed booking would then need its use handed back.
- A clash check runs one fixed-parameter query per night added, at most a run's 31.
