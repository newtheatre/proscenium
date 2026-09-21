# 0084: The member shell is calm, its headings are two sizes, and its pages take a named width

- Status: Proposed
- Date: 2026-09-21

## Context

`docs/design-language.md` has said since 0021 that the expressive kit belongs to the public site
and the show-night screens, and K-127 criterion 4 says the member surfaces stay calm. Neither is
enforced anywhere. `tests/e2e/shells.test.ts` counts the kit on a public view and refuses it in
the console, and stops there, so the member shell was the one surface the language governed by
habit alone. The pre-cutover review (issue 1153 item 1) found fifteen expressive headings on
seven of the member's own screens: the display face on "Outstanding", on "Charges", on the three
cards of the membership page and on the two of the security page. The face that makes a show
title feel like a poster was being spent on a tab balance.

The same review (item 2) found the shape underneath it just as unsettled. Fifteen pages under
the `member` layout spell five page widths between them (`max-w-5xl py-10`, `max-w-3xl py-16`,
`max-w-3xl py-10`, `max-w-xl py-16`, and one page with no width at all) and three heading styles
(`nnt-headline text-lg`, `nnt-headline text-xl`, and a small uppercase mono eyebrow on the
training pages that is the show-night shell's register borrowed onto a reading screen). A member
moving from the rota to their tab to their training crosses three column widths and three
heading voices inside one shell, and every new screen copies whichever neighbour its author
happened to open.

## Decision

**The member shell is calm. Its headings are two sizes and its pages take one of three named
widths.**

### Nothing from the expressive kit

No page under the `member` layout, and neither of the two files that draw the shell around them
(`app/layouts/member.vue`, `app/components/AccountSettings.vue`), uses `nnt-headline`,
`nnt-spotlight`, a sticker, a marquee, a ticket, a poster variant or any other utility from the
kit. There is no exception on the shell. `/passes` keeps the display face and is not one: it is
a public page in the `default` layout, opened from an issuing email by a person who may hold no
session at all and shown at the door, which is the public moment the kit exists for. The
training catalogue (`/training/modules`) is public for the same reason, and the session register
wears the `tonight` shell, where the kit is also at home.

### Two heading sizes

The page title is the one the `member` layout's page draws through `UPageHeader`, or the one
`AccountSettings` draws for the three account settings pages. A page that genuinely needs to
draw its own writes one `h1` of `text-2xl font-semibold text-highlighted`; none does today.

A section heading is `text-lg font-semibold`. A heading nested inside a section is
`text-base font-semibold`. The small uppercase mono eyebrow is the show-night shell's register
and is not used here: on a reading screen it says less than the words it shrinks.

### Three named widths

A page does not spell its own width. `app/utils/member-shell.ts` names them and a page takes one:

| Constant | Value | For |
| --- | --- | --- |
| `MEMBER_PAGE_READING` | `max-w-3xl py-16` | A page you read: your rota, your bookings, your training, your tab, your passes |
| `MEMBER_PAGE_WORKING` | `max-w-xl py-16` | One form you fill in: booking a room, declaring access requirements, your membership |
| `MEMBER_PAGE_WIDE` | `max-w-5xl py-10` | A page whose content is a grid or a second column: the overview, account settings, the room calendar |

The first two are the reading page and the working page the ruling asks for, and each is the
spelling four pages already used. The third is not a third posture: it is the width a grid needs,
and it belongs to the two files that draw columns plus the room calendar, which is seven days
across and cannot be a reading column.

## Consequences

- `tests/unit/design-language.test.ts` is the gate, as it is for colour and focus: it refuses a
  kit class on a member page, a heading at any other size, an uppercase heading, a page that
  spells a width on its own container, and a page that names none of the three constants.
  `tests/e2e/shells.test.ts` reads the same rule back from a real browser on eight member
  screens, the way it already does for the console.
- Twenty-one headings and three page widths change. No wording changes with them.
- Three pages move width: the tab and the passes pages gain the reading page's padding, and the
  room calendar gains a maximum width, having had none.
- A member screen added later inherits the shape by naming a constant, and fails the suite if it
  invents one. The record is what a successor cites rather than the neighbouring page they
  happened to open.
- `docs/design-language.md`'s chrome table and expressive-kit paragraph now say what is
  enforced, so the guide and the tests cannot drift apart quietly.

## Options considered

- **Change the guide instead, and let the member shell be expressive.** Refused. The split in
  0021 is about what the person is doing, not about whether they are signed in: a member reading
  a tab balance at 19:15 is doing the calm half of it. Spending the display face on every screen
  is also how it stops signifying anything on the screens that need it.
- **Keep `nnt-headline` for the member's happier moments (a confirmed booking, a claimed
  membership).** Refused: "happier" is not a line a test can draw, and the budget rule in 0021
  survives only because it is counted rather than judged.
- **One width for every member page.** Refused: a seven-day room calendar and a two-column
  settings page in a reading column are unusable, and the overview's tile grid collapses to one
  column for no reason.
- **Name the widths as a CSS utility in `theme.css` instead of constants.** Refused: `theme.css`
  holds tokens, and a layout width that only the member shell uses is not a token. A constant is
  also what a test can name.
