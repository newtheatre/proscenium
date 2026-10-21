# 0126: A stocktake count is compared with on-hand when it is entered, and never applies below zero

- Status: Proposed
- Date: 2026-10-14
- Amends: F-115 criteria 1, 3 and 4

## Context

F-115 criterion 1 captures each line's expected figure when the stocktake opens, "so later sales
do not muddy the comparison". That holds only if the count is taken the moment the stocktake
opens. A count walked over a week, or entered against a stocktake left open since the last one,
reads a shelf that the sales in between have already emptied, and the variance (counted minus
the opening figure) counts those sales a second time as a loss. Applying it posts that loss on top
of the on-hand the sales already reduced.

The hands-on review of 13 October 2026 hit exactly this: Crisps went to -45 and Lager to -64, and
Gin to 3121 ml after a count of 96 ml. The till then greyed out items that were on the shelf
(F-128 criterion 8 trusts the applied balance, 0080), and the order list asked for 105 crisps.
Nothing refused a count that would leave stock below zero, and an 18 ml count of a 3150 ml whisky
line applied without a word.

## Decision

**A count is compared with on-hand at the moment it is saved.** The statement that records a
count (`countStatements` in `server/utils/stocktakes.ts`) also sets the line's `expected_qty` to
the sum of the item's movements as that statement runs. Counting a line again compares it
afresh; clearing it leaves the figure alone. The variance shown, its cost and the adjustment
Apply posts all read that figure, so they still agree with each other (F-115 criterion 3). A sale
after the count stays on top of it, which is what the shelf will show. No new column is needed:
`expected_qty` was always a snapshot, and now it is taken when the count is, not when the
stocktake opened. Nothing stores a balance that a movement does not explain (F-114 criterion 2).

**Apply refuses a stocktake that would leave any counted item below zero**, naming each one and
the figure it would reach. The guard is a `NOT EXISTS` on the freezing `UPDATE`'s own predicate,
reading on-hand as the batch runs, so a sale racing the apply cannot slip past it (0003); the
audit row and the adjustments chain on `changes()` as before, so a refused apply writes none of
them. The cure is to count those items again, which re-snapshots them.

**A count under half or over double what was expected is listed before Apply** as "Check these
counts first" (`countToCheck` in `shared/utils/stocktakes.ts`). It is a question to the person
applying, never a refusal: a genuine loss can be that large. The confirmation also lists every
adjustment it will post, with its quantity and cost, rather than one net figure.

## Consequences

- A stocktake can be counted over several visits without inflating its variance.
- A stocktake opened before this change, with counts already entered, keeps its opening figure on
  those lines until they are counted again; the below-zero guard catches the damaging ones.
- Stock already driven negative by an earlier apply is corrected the usual way: a new stocktake
  or a reversing movement (F-115 criterion 5). Nothing here rewrites a movement.
- The shift still counts blind (0099): it is never sent the figure the count is compared with.
