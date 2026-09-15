# 0079: Wastage reasons are a fixed vocabulary in code, with optional free-text detail

- Status: Accepted
- Date: 2026-09-15

## Context

Module F has carried an open question since the backlog was written: are wastage reasons a fixed
vocabulary or a list the bar manager keeps? Waste analytics (F-204) needs structure, because free
text alone cannot be reported on, and a bar that writes "spilt", "spillage", "spilled a pint" and
"knocked over" into four rows has four reasons and no analysis.

The question was in fact answered in code, without a record. `MOVEMENT_REASONS`
(`shared/utils/bar.ts`) is a nine-value list with a comment citing F-204 and 0010, and
`movementForm` enforces it. That is the right answer, but a decision settled by a comment is a
decision a successor may quietly reverse, and the same list is also missing the half of F-204
criterion 1 that says "with optional free-text detail": there is nowhere to write which bottle,
which line, or which night it was.

## Decision

**The reason vocabulary is fixed in code, in `MOVEMENT_REASONS`.** It is not a screen and not a
table. Adding a value is a pull request that a person reviews, which is the point: a vocabulary
that grows from a text box grows to forty near-duplicates within a season, and the committee turns
over yearly, so nobody is left holding the tidy-up.

**It is not a lookup table either.** `stock_movements` is append-only (0010): a row names its
reason for ever, and a table invites renaming or deleting a value that thousands of rows already
cite. A value that is wrong is superseded by adding the right one and leaving the old one in the
list, the same way every other append-only correction works here.

**A movement may carry optional free-text detail**, in a nullable `stock_movements.detail` column
added by `ALTER TABLE ADD COLUMN`, which is not a rebuild and is therefore permitted on an
append-only table (0010, 0033). It is declared bare: no default, no CHECK, no reference. The
movement form bounds its length and the screen labels it as a note about the stock, not about a
person.

**No personal data goes in it** (0011). Detail is unscrubbable: an append-only row cannot be
edited, and erasure anonymises a person in place rather than rewriting the rows that mention them.
The form's help text and the wiki page both say so in as many words, which is the only enforcement
free text can have.

**Two of the nine reasons are not losses.** A count correction and an opening balance move the
figure without anything leaving the shelf, so the wastage section counts every other reason and
never those two. The same list serves `WASTAGE` and `ADJUST` on the stock screen, and nothing at
the write path pairs a kind with a reason, so a write-off typed in as a negative adjustment naming
a loss is counted as the write-off it plainly is. A new reason counts as a loss unless it is added
to the pair, which is the safe default: a loss nobody reports is worse than one reported twice.

**Reports group by reason, never by detail.** The bar report's wastage section groups by reason,
item and category (F-204 criterion 2); detail is shown on the movement itself and nowhere else.

## Consequences

- F-204 criterion 1 is satisfied without a management screen. The wastage report section it asks
  for is a query over movements that already exist, so most of criterion 2 comes with it.
- A new reason needs a deploy. That is a day or two, and wastage is not urgent work; the `OTHER`
  value exists for the row that cannot wait.
- `detail` can hold something it should not, and nothing can take it out again. The mitigation is
  the label, the wiki and the fact that nobody is asked for a name at that point in the form.
- The column and the form field land with F-204's own story. This record is the spec they build
  to; only the vocabulary half is live today.

## Options considered

- **A bar-manager-managed list.** Rejected on the append-only argument above, and because the
  near-duplicate problem it creates is the exact thing the structure was for.
- **Free text alone, with reporting by search.** Rejected: F-204 criterion 1 asks for reasons that
  aggregate, and a search over prose is not an aggregate.
- **A `movement_reasons` table with a foreign key.** Rejected twice over: the foreign key would
  have to be added to an append-only table, which is a rebuild, and the table would still be
  editable underneath rows that cite it.
