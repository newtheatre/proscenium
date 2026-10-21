# 0128: A bar export is numbers with ISO dates, and a bar report says what it leaves out

- Status: Proposed
- Date: 2026-10-14
- Amends: F-119 criteria 1 and 2

## Context

The hands-on review of 13 October 2026 opened the bar's CSV exports in a spreadsheet as the
treasurer would, and read the reports beside them:

- Money arrived as text, "£2.50", and a loss as "−£1.20" with a Unicode minus, so no column
  summed. Dates were "12/10/2026, 21:04", which sorts as text and reads month-first in some
  spreadsheets. The variance
  export named each stocktake by its raw id.
- Every export of a section had the same file name, so two periods overwrote each other in a
  downloads folder; an empty period downloaded a 0-byte file with no heading.
- A column was headed "foregone" in one place and "Forgone" in another.
- The discounts report's **Times applied** counted basket lines: one sale of three drinks with a
  discount read as three.
- The variance report gave neither the stocktake nor its date per line, no unit (a loss of 43
  read the same in ml as in cans), and no total.
- Gross profit counted only the cost of stock that had a delivered cost. A sale that poured
  nothing, or poured stock never delivered with a cost, made the figure look better than it was,
  with nothing on the screen saying so.

## Decision

**An export is for arithmetic.** Money is pounds with two decimal places and a plain minus, with
the heading saying the unit ("Revenue (£)"). A moment is `YYYY-MM-DD HH:MM` on the London clock
(0014). The columns of each section are declared (`BAR_REPORT_COLUMNS`), so an empty period
still exports its heading row. The file name says the section and the period
(`bar-variance-week-from-2026-10-05.csv`), and the page where a section runs to several.

**A discount's count is sales, not lines**: the number of ledger entries that carried it,
headed "Sales given it".

**A variance line says where it came from**: the stocktake's opening and applied moments, linked
to the stocktake, and its unit; the section carries the total value of the period's variance.

**Gross profit names what it could not cost**: the products sold in the period without pouring
any stock, and the stocked items poured without a delivered cost, each listed above the figure
with what to do about it. The figure itself is unchanged; F-119's definition, revenue against
the delivered cost of depleted stock, stands.

## Consequences

- An export opened in a spreadsheet sums, sorts and filters without cleaning.
- The comps column is "Forgone" everywhere.
- A sale that the seed data recorded with no cost now shows as a warning on the GP section
  rather than silently raising the margin; the seed itself is not changed by this record.
