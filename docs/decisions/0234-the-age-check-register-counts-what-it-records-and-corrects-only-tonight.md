# 0234: The age check register counts what it records, and corrects only tonight

- Status: Proposed
- Date: 2026-10-21

## Context

The Challenge 25 sheet asks for an appearance, never a name, but nothing stopped a volunteer typing
"Sam Jones in a red coat". The night report counted accepted and refused checks only, so a night of
visibly-over-25 entries read as no checks at all, and a check logged with no performance (one at
the bar on an evening with no show) appeared on the register and nowhere on the report. A
correction could be filed against any entry by anyone working any house tonight, including an
entry from a night already signed off.

## Decision

- A description that looks like a name is warned about on the sheet before it is logged or filed
  as a correction. That warning is 0218's (`looksLikeName`), which landed first; this record adds
  nothing to it.
- The night report counts all three outcomes for the performance, and separately says how many
  checks logged inside tonight's bounds had no performance, so nothing on the register is missing
  from the report. Superseded entries are not counted.
- A correction is refused unless the entry was logged tonight, and is authorised against the
  entry's own performance where it has one, so only somebody working that house can correct it.

## Consequences

- An earlier night's register is corrected nowhere on the show-night screens; the console's export
  is unchanged and a wrong old entry is a matter for the Front of House Manager.
