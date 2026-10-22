# 0214: The rota board's span lives in the address, and the old approvals address forwards first

- Status: Proposed
- Date: 2026-10-22
- Amends: E-107 criterion 7 (the board's window), E-105 criterion 2 (the approvals address)

## Context

The board read its window from two date fields and nowhere else, so `/rota/manage/shifts?from=…&to=…`
opened on the coming fortnight whatever it said. An officer could not link a colleague to next
month's rota, and a reload lost the span they were reading. Separately, `/rota/manage/approvals`
ran the console guard before forwarding to the board's waiting filter, so a member without the
console reached a bare refusal at an address that no longer has a screen of its own.

## Decision

**The board reads `from` and `to` from the address, and accepts `until` for `to`.** Both are London
dates (`YYYY-MM-DD`). `from` alone reads a fortnight from it. A date that does not read, or a span
the board's own query would refuse (backwards, or longer than a year), falls back to the fortnight
whole rather than half-applying. Changing the dates writes them back with `replace`, so the address
always names what is shown and the back button is not filled with every keystroke. The fortnight
itself is left out of the address.

**The old approvals address forwards before any guard.** The board guards itself, so everybody who
follows an old link lands on the board and is refused there, or not, by the same rule as everybody
else.

## Consequences

- A span can be bookmarked and shared, and survives a reload.
- A bad span in a link shows the fortnight without an error; the chip beside **Filters** says what
  is being read.

## Options considered

- **Refuse a bad span with an error page.** A typo in a shared link would then show nothing at all,
  where the fortnight is nearly always what was wanted.
- **Keep the guard on the old address.** It guards nothing: the address renders no data.
