# 0099: Tonight's confirmed bar shift may enter stocktake counts

- Status: Proposed
- Date: 2026-09-26

## Context

Entering a stocktake count needed `bar.write`, which only the Bar Manager's role holds, so counting
the whole register was one person's phone job. 0080 makes the first applied count the bar's
opening balance, and the count is walked shelf by shelf on a quiet night, which is exactly when a
bar shift is standing there. Issue 1322 found it in the MVP flow review of 25 September 2026.

0009 rules that operational authority derives from facts, never from a standing grant, so the
answer cannot be a list of named helpers. 0044 and 0078 already say what tonight's confirmed
shift is and when its window runs, and the till reads exactly that.

## Decision

**While a stocktake is open, tonight's confirmed bar shift may enter and change counts, inside
its window.** The count route resolves authority as the till does (`requireNightAuthority` for
the bar role): a confirmed `BAR` shift on one of tonight's performances or on tonight's bar
opening (0077), inside its window and grace (0078). A claimed shift, a shift whose window has
ended, or a shift on another night gives nothing. A holder of `bar.write` counts as before, on any
day, with no shift.

**Each count records who entered it.** `stocktake_lines.counted_by` names the account that
entered the figure now standing, and clearing a count clears it. The stocktake shows it on every
line, so the Bar Manager reviews each one before Apply.

**Opening and applying stay with `bar.write`.** The shift enters figures; the balance is set by
the Bar Manager's Apply, which is the decision 0080 cares about.

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

## Options considered

- **The Bar Manager only.** The status quo, and the finding.
- **Named helpers.** A standing grant by name, which 0009 rules out.
- **Any signed-in member while a count is open.** Nothing ties them to the bar or to tonight.
