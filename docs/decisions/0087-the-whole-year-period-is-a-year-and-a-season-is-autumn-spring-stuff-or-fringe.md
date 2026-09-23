# 0087: The whole-year period is a year, and a season is Autumn, Spring, StuFF or the Fringe

- Status: Accepted, 23 September 2026 (IT Manager)
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

Recorded after the IT Manager's answers of 23 September 2026 to the questions this record first
left open.

- **The 1 August to 31 July period is a year.** Its period kind is `YEAR` (it was `SEASON`), it
  is named by the two calendar years it spans ("2026/27", the same rule as the committee year,
  0009), and every screen, document and setting label that called it a season says "year". The
  boundary itself is unchanged.
- **A season is one of the theatre's seasons: Autumn, Spring, StuFF or the Fringe of an academic
  year.** StuFF and the Fringe are seasons in their own right, outside Autumn and Spring, not parts
  of either. The money screens offer `SEASON` as a period beside `YEAR`, `TERM` and the calendar
  periods.
- **A season is a row of the `seasons` table** (D-131), named and dated by the Box Office Manager:
  "Autumn 2026", "Spring 2027", "StuFF 2027", "Fringe 2027". The table no longer means the
  committee year. The `SEASON` period is bounded by that row's own `starts_on` to `ends_on`, by
  ledger date, exactly as a term's range bounds `TERM`; the server looks the row up by id for
  anyone holding `finance.read` or `finance.summary`, so the treasurer needs no box office
  permission to choose one. No season date is configured, so nothing is guessed (0012).
- **Seasons are dated so they do not overlap.** This is guidance on the Seasons page, not a
  database constraint: a season read by date counts everything taken on its days, bar included,
  and overlapping days would count twice across two seasons.
- **The configuration keys follow the word.** `SEASON_START` and `SEASON_END` become `YEAR_START`
  and `YEAR_END`, a data migration moving any stored row, and every content token and the ticket
  export's (D-129) whole-year filter move with them; the export's `season` filter becomes `year`.
- **`TERM` stays beside `SEASON`.** A term is what the treasurer closes (I-107) and need not match
  a season.
- **The public What's on heading names the current season** (amended 23 September 2026 at the IT
  Manager's direction): the unretired `seasons` row today falls in, else the next one to begin,
  else no season word at all. A finished season is never named and no name is ever guessed; the
  whole-year "26/27" band is gone.

## Consequences

- Renaming the period kind touches every caller of `periodForm` and the bar reports' own kinds in
  the same change; a stale client sending `kind=SEASON&year=` is refused by validation rather than
  read as a whole year.
- The `seasons` table stops meaning the committee year: the seed, the Seasons page and D-131's
  documentation change with it, and the seasons already imported or entered as "2026/27" need
  renaming or splitting by the Box Office Manager, which is a data task, not a migration.
- A stored `SEASON_START` or `SEASON_END` row is renamed in place by migration, so a committee
  that changed the boundary keeps its value; the audit trail keeps the old key's history as it was.

## Options considered

- **Keep "season" for the whole year and add "half" or "term" for the rest.** Refused: the word
  on the screen must mean what the committee means by it.
- **Attribute a season's money by show (`shows.season_id`) rather than by date.** Exact for
  tickets, but bar, membership and pass money have no show and would vanish from the season.
- **Fixed calendar dates for each season in configuration.** Refused unless the workshops propose
  them: the terms move each year, and a guessed date is a policy number nobody set (0012).
