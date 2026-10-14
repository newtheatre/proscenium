# 0130: The SU export traces each line, in columns after the six it always had

- Status: Proposed
- Date: 2026-10-14
- Amends: I-108 criterion 2 (the CSV shape)

## Context

The hands-on review of 13 October 2026 (Treasurer's money screens, pain points) could not sum the
SU export down its amount column, and could not trace a line back to where it came from:

- A drink on a tab appears twice, as a `BAR_ITEM` on `TAB` and as the `TAB_SETTLEMENT` that paid it.
- The closing card total is a row with no date, which spoils sorting.
- No column says which show, booking or point of sale a line belongs to.
- The rows did not look like they were in time order.
- Every nominal code went out `UNMAPPED` with no warning.

The first two are deliberate. Issue #1363 settled them: the file carries every tender, its tender
column says which lines are reader money, and it closes on the card total, the figure the money
dashboard calls revenue (architecture.md, SU accounting exports). Dropping the tab lines would
lose the bar's sales by category; moving the total out of the file would lose the one figure the
treasurer checks it against. Neither is reopened here. The rows were already in time order within
each day (`london_day`, then `happened_at`), but nothing on a row showed the time.

## Decision

**Four columns follow the six the SU reads, and those six never move.** After `date, category,
tender, nominalCode, amountPence, amountPounds` come:

- `time`: the London clock time the entry was taken, so the order within a day is visible.
- `source`: where it was taken, in the words the ledger screen uses (Desk, Till, Self-serve and
  so on).
- `show`: the title of the show the line's performance belongs to, blank when it has none.
- `reference`: the booking reference the line belongs to, blank when it has none.

Each is read by `LEFT JOIN` on the line's own `performance_id` and `reservation_id`, so a line
with neither still exports, unchanged. The card total row leaves all four blank. A spreadsheet
that reads the SU's six columns by position reads them as before; one that sums the amount
column still has to filter by tender, as #1363 already says.

**The screen warns before the download when lines would go out unmapped.** The coverage route
counts them on the same predicate as the export (`suExportCountQuery`) and the screen says how
many, and where to map them. It is a warning, not a refusal: criterion 3 still exports an
unmapped line on its own `UNMAPPED` row. The mappings list says that a bar item on a tab maps
under Bar item, Till, since a mapping is keyed by kind and source, never by tender.

## Consequences

- The export reads `performances`, `shows` and `reservations` beside the ledger: three indexed
  joins by primary key per line, under the existing row cap.
- The file name, the `x-period-status` header and the byte-identical rerun over a closed range are
  unchanged. A closed range still gives the same bytes, because the four new columns come from
  rows that do not change once written.
- No personal data is added: a show title and a booking reference, never a name or an email.

## Options considered

- **Drop the `TAB` lines, or move the card total to a header.** Rejected: #1363 already decided
  both, for the reasons above.
- **Put the new columns first.** Rejected: an import already built on the six columns by position
  would break.
- **Refuse the export while any line is unmapped.** Rejected: I-108 criterion 3 exports unmapped
  lines explicitly, and a return can be due before every code is known.
