# 0136: The Challenge 25 register reads on screen for whoever may export it

- Status: Proposed
- Date: 2026-10-14
- Amends: E-119 (the export screen also lists what it exports)

## Context

`/rota/manage/age-checks` offered a date range and two download buttons and nothing else. To see
whether a night had any checks at all, the Front of House Manager had to download a file. The
hands-on review of 13 October 2026 found the screen "shows nothing on screen, only exports", and
that the CSV left the venue of a check with no performance empty where the PDF said "Bar (no
performance)". The page also took today's date from UTC, so after 23:00 in summer it opened on
tomorrow (0014).

## Decision

**The screen lists the range it would export, newest first, a page at a time.**
`GET /api/admin/age-checks` takes the same `from` and `to` as the export, is gated on the same
`age-checks.export` permission, and returns the rows the export carries through the same row
definition, paged in SQL. E-119 criterion 4 is unchanged: a shift alone still reads only tonight's
entries, on the phone, and never the history.

Reading is not audited, as no other console list read is; an export still is, with its range,
format and row count. A row with no performance names its venue as "Bar (no performance)" through
one helper, `ageCheckVenue()`, on the screen, the CSV and the PDF alike. The range opens on today's
London date.

## Consequences

- An inspection still costs one download, and checking a night before downloading costs none.
- The CSV's venue column is never blank.
- The screen shows the supersede chain in words ("Corrected by a later entry", "Corrects an earlier
  entry") rather than ids, which stay in the CSV for a machine to follow.
