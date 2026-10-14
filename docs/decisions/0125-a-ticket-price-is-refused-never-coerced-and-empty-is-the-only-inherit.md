# 0125: A ticket price is refused, never coerced, and empty is the only inherit

- Status: Proposed
- Date: 2026-10-14
- Amends: D-119 criterion 1 and D-120 criterion 1 (how a price is typed)

## Context

The base price on Ticket types and the price grid on a show or a performance used a number field
formatted as pounds. The hands-on test of 13 October 2026 typed -5 and saved a free ticket; 7.555
became £7.55; in the grid, -5 was shown back as "Inherit", so a refusal looked like an override
removed. The schema already refused a negative or fractional figure, but the field had changed the
figure before the schema saw it, and the refusals it did reach said zod's words, not ours. Each row
of the grid also carried two controls labelled "Inherit".

## Decision

- **A price is typed as text and held in pence.** Both screens use `PoundsField`, the bar's field
  for money (`app/components/PoundsField.vue`, read by `penceFromTyped()`), so a ticket price and a
  bar price read a typed figure the same way. Text that is not pounds and pence is held as NaN.
- **NaN, a negative and anything above `MAX_TICKET_PRICE_PENCE` are refused in our words.** The
  `pence` schema in `shared/utils/ticket-types.ts` says "Type a price in pounds and pence, such as
  7.50", "A price cannot be below nought" or "A ticket costs at most £1,000.00". The grid refuses on
  Save, naming the ticket type, and sends nothing: JSON would carry NaN as null, which the route
  reads as inherit.
- **Empty is the only inherit.** A field emptied by the officer inherits; a field holding a
  refused figure keeps it on screen until it is put right.
- **The row's clearing button is "Clear row"**, since it empties both the price and the sale
  setting, leaving "Inherit" to mean only the setting's own choice.

## Consequences

- -5 and 7.555 are refused where they are typed, and nothing is written.
- A price grid holding a refused figure cannot be saved until it is fixed or cleared, which is the
  intent: half a save would leave the officer unsure which rows changed.

## Options considered

- **Clamp the field at nought.** It is what turned -5 into a free ticket; a silent change is the
  defect, not the fix.
- **A second, ticketing-only money field.** Two fields that parse pounds would drift; the bar's is
  already the house's one way to read a typed price.
