# 0099: Tonight's confirmed bar shift may enter stocktake counts

- Status: Proposed
- Date: 2026-09-26

## Context

Entering a stocktake count needed `bar.write`, which only the Bar Manager's role holds, so counting
the whole register was one person's phone job. 0080 makes the first applied count the bar's
opening balance, and the count is walked shelf by shelf on a quiet night, which is exactly when a
bar shift is standing there. Issue 1322 found it in the MVP flow review of 25 September 2026.
0009 rules that operational authority derives from facts, never from a standing grant, so the
answer cannot be a list of named helpers; 0044 and 0078 already say what tonight's confirmed
shift is and when its window runs, and the till reads exactly that.

The committee's answer on the opening balance (issue 1297) is that the Front of House Manager
takes the full count, regularly, the first about 7 October 2026. That role held no bar
permission at all, so it could neither open, count into nor apply a stocktake.

## Decision

**While a stocktake is open, tonight's confirmed bar shift may enter and change counts, inside
its window.** The count route resolves authority as the till does (`requireNightAuthority` for
the bar role): a confirmed `BAR` shift on one of tonight's performances or on tonight's bar
opening (0077), inside its window and grace (0078). A claimed shift, a shift whose window has
ended, or a shift on another night gives nothing. A holder of `bar.stocktake` counts on any day,
with no shift.

**Each count records who entered it.** `stocktake_lines.counted_by` names the account that
entered the figure now standing, and clearing a count clears it. The stocktake shows it on every
line, so whoever applies it reviews each one first.

**The stocktake is a permission of its own, `bar.stocktake`, and the Front of House Manager holds
it.** It opens a stocktake, counts into it, reads it and applies it. The Bar Manager's role holds
it beside `bar.write`, and the Front of House Manager's role holds it and nothing else of the bar:
not the catalogue, its prices or discounts, nor the rest of the stock register. This is the
interpretation the committee's answer needs, and it is a standing grant for sit-down committee
work planned ahead, as the rota is, not a night's authority, so 0009 is kept.

**Opening and applying need `bar.stocktake`; the shift only enters figures.** The balance is set
by Apply, which is the decision 0080 cares about.

**The shift counts blind.** Issue 1321's count hides the expected figure until a line is counted.
The shift is sent no expected figure, variance or cost at all, so what it could work the expected
figure back from never reaches it; a holder of `bar.stocktake` reads them all. A holder with no
authenticator on tonight's bar shift counts through the shift, blind, as the till lets them sell
(0044).

**Reading the open stocktake follows counting.** The shift may read the open stocktake it may
count into; it may not open one, apply one, or read a closed one.

## Consequences

- Counting becomes a shift task: a bar volunteer on a quiet night can walk the shelves while the
  Bar Manager reviews and applies.
- `counted_by` is a bare, nullable column (a reference would rebuild the table), registered as
  personal data kept on erasure, since the tombstone still answers for the count.
- The check reuses the night-authority resolution, so its refusals (outside the window, no shift
  tonight) read the same as the till's.
- Tests cover an ended window and an unconfirmed claim, and that the shift cannot open or apply.
- The Front of House Manager's console shows Stocktakes and no other bar screen, and a test holds
  that role to `bar.stocktake` alone among the bar's permissions.

## Options considered

- **The Bar Manager only.** The status quo, and the finding.
- **Named helpers.** A standing grant by name, which 0009 rules out.
- **Give the Front of House Manager `bar.write`.** It opens the catalogue, its prices and discounts
  too, none of which the full count needs.
- **Any signed-in member while a count is open.** Nothing ties them to the bar or to tonight.
