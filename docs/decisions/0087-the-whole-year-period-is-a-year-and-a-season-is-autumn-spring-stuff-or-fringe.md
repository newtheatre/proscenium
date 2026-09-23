# 0087: The whole-year period is a year, and a season is Autumn, Spring, StuFF or the Fringe

- Status: Proposed (the rename is decided by the IT Manager; how a season's days are known is open)
- Date: 2026-09-23

## Context

I-105 called 1 August to 31 July the "season" (audit PR-7), and every money and report screen
since has offered a `SEASON` period meaning the whole committee year: the money dashboard, revenue
by show, the bar reports and the season reports. Feedback from the money screen (issue 1207) says
that is not how the theatre uses the word: a season is Autumn or Spring of an academic year, and
StuFF and the Edinburgh Fringe sit outside both. A treasurer reading "Season 2026/27" therefore
sees two seasons' money, and more, under a word that means something narrower. The IT Manager has
decided the whole-year period is renamed, and a true season is added beside it.

The programme already has a `seasons` table (D-131): a named row with `starts_on` and `ends_on`,
which a show points at through `shows.season_id`. It is documented and seeded as the committee
year ("2026/27"), and legacy seasons are imported as they stood, but nothing in the schema ties a
row to a whole year. Nothing in the repository says which days Autumn, Spring, StuFF or the Fringe
cover in a given year, and `docs/workshops.md` proposes no such dates.

## Decision

- **The 1 August to 31 July period is a year.** Its period kind is `YEAR` (it was `SEASON`), it
  is named by the two calendar years it spans ("2026/27", the same rule as the committee year,
  0009), and every screen, document and setting label that called it a season says "year". The
  boundary itself is unchanged.
- **A season is one of the theatre's seasons: Autumn, Spring, StuFF or the Fringe of an academic
  year.** StuFF and the Fringe are seasons in their own right, outside Autumn and Spring, not parts
  of either. The money screens offer `SEASON` as a period beside `YEAR`, `TERM` and the calendar
  periods.
- **How a season's money is found is to be settled before it is built** (issue 1207). The
  recommended rule is that a season is a row of the existing `seasons` table, whose own
  `starts_on` and `ends_on` bound the period exactly as a term's range bounds `TERM`; the Box
  Office Manager names and dates each one ("Autumn 2026", "StuFF 2027"), no date is configured
  or guessed, and a show belongs to the season it plays in.

## Consequences

- Renaming the period kind touches every caller of `periodForm` and the bar reports' own kinds in
  the same change; a stale client sending `kind=SEASON&year=` is refused by validation rather than
  read as a whole year.
- If the recommended rule is taken, the `seasons` table stops meaning the committee year: the seed,
  the Seasons page and D-131's documentation change with it, and the seasons already imported or
  entered as "2026/27" need renaming or splitting by the Box Office Manager.
- A season read by date counts everything taken on its days, bar included; money taken for a
  StuFF show during Spring's days would count in Spring unless the seasons' days do not overlap.
- `TERM` (I-107) stays: a term is what the treasurer closes, and it need not match a season.

## Options considered

- **Keep "season" for the whole year and add "half" or "term" for the rest.** Refused: the word
  on the screen must mean what the committee means by it.
- **Attribute a season's money by show (`shows.season_id`) rather than by date.** Exact for
  tickets, but bar, membership and pass money have no show and would vanish from the season;
  held as the alternative to the date rule above.
- **Fixed calendar dates for each season in configuration.** Refused unless the workshops propose
  them: the terms move each year, and a guessed date is a policy number nobody set (0012).
