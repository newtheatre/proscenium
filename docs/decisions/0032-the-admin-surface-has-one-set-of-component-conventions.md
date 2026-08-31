# 0032: The admin surface has one set of component conventions

- Status: Accepted
- Date: 2026-08-30

## Context

Five admin screens were built one after another, each copying the last. A review of all of them
against the Nuxt UI component matrix, with screenshots of every screen and modal at two widths,
found the same thing everywhere: the components are not wrong so much as **unchosen**. Where a
specific component existed for the job, we reached for `UInput`.

The evidence, in the pictures rather than in the diff:

- A person is entered by pasting a thirty-two character identifier, in four places. There is no
  search, no name, and no way to tell you picked the right person.
- Six date fields render as `mm/dd/yyyy`, in American order, in a British theatre's admin.
- Filter rows are bare flex rows. The audit page's wraps onto a second line at 1400 pixels, the
  people page's filter grows and shrinks as its value changes, and a search box truncates its own
  placeholder.
- The audit table prints `user:` and an identifier where a name belongs.
- Fifty settings share one scroll, every number in a full-width text box.
- Nothing uses a toast, so every confirmation stays on the page afterwards.
- No form validates on the client, so a refusal appears as a red alert behind the modal it
  concerns.

None of that is a design decision anybody made. It is what happens when the choice is made five
times by copying.

## Decision

**The choice is made once, here, and a test holds it.**

- **A person is chosen, never typed.** Any field naming somebody uses the shared picker: an
  autocomplete searching name, address and student number, debounced, showing who was picked. The
  identifier is what the picker submits and never what a human types.
- **The component matches the value.** A date is `UInputDate`; a number is `UInputNumber`; money is
  entered in pounds and stored in pence (0004); a list of scalars is `UInputTags`; a short closed
  list is `USelect` and a long or searchable one is `USelectMenu`; free text that runs to a sentence
  is `UTextarea`.
- **One schema validates both ends.** The Zod object the endpoint validates lives in `shared/` and
  drives the form, so a field error appears under its field. A refusal from the server is set on the
  field it concerns, not raised as a page alert.
- **Filters live in a dashboard toolbar**, at fixed widths. A control that resizes when its value
  changes is what makes a row feel unstable, and a row that wraps at a normal window size is a
  layout that was never tried at that size.
- **A confirmation is a toast. An alert is for something the reader must act on.** A table with
  nothing in it says what would be there.

**The conventions are enforced by `tests/unit/admin-conventions.test.ts`**, the way the design
language is enforced by a test rather than by review (0021). What review still judges is whether a
screen says the right thing; a test cannot see that.

## Consequences

- A new admin screen starts by copying one that already follows this, and the test catches it if it
  copies something older.
- The picker needs a search endpoint. It reuses the account directory, which already pages,
  allow-lists its columns and searches name and address; the search gains student number. Every role
  that may award a fellowship or record a membership already reads accounts, so nothing moves.
- Moving request schemas into `shared/` means a client bundle carries the shape of every admin
  request body. Those are field names and limits, not secrets, and the alternative is two
  definitions that drift.
- Fifty settings become searchable and grouped into tabs. The register is still one page in the
  sense that matters: every key is reachable and searchable from it.
