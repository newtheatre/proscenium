# 0137: A member's open places of one role on one performance are one row

- Status: Proposed
- Date: 2026-10-14
- Amends: E-103 criterion 2 as trimmed by issue 1335 (how "Shifts you can take" draws a night)

## Context

`/rota` listed every open slot as its own row. A performance stamped with two Door slots showed two
identical rows, "Door, The Nottingham New Theatre, Saturday 17 October at 19:30, The Winter's Tale",
each with its own Claim button, on every night of the season. To a member the two are one choice:
they can hold one shift per performance, and either slot is the same work. The hands-on review of
13 October 2026 read them as duplicates.

## Decision

**Open slots of one role on one performance are drawn as one row, saying how many places are open.**
`oneRowPerRole()` (`shared/utils/my-rota.ts`) groups the page's rows by performance and role,
keeping the first slot's id and counting the rest. Claim claims that slot. The claim route is
unchanged and still race-safe: if somebody else took that slot first, the refusal is shown and the
list is read again, so a remaining place of the same role is offered under its own id.

The grouping is a drawing of the page the server returned; the server's paging and counts are
untouched, so a night split across a page boundary can show the role on both pages.

## Consequences

- A night reads as the roles a member can take, not as the template's arithmetic.
- The same claim button no longer double-fires into a 409 for a slot the member has just taken:
  a press while a claim is in flight is ignored on the page, and the row it pressed redraws when
  the list is read again.
