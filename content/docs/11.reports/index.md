---
title: Reports
description: Incident trends and each performance's attendance and staffing across any period, with a CSV export of each.
module: Show night
audience: committee
updatedOn: 2026-09-26
updatedBy: Matt Adcock
navigation:
  title: Overview
  icon: i-lucide-chart-no-axes-combined
---

Reports at **Manage, Reports** looks back over many show nights at once: which kinds of incident
keep happening and where, and how each performance went for attendance and staffing. The Front of
House Manager, the Safety Officer, the Committee and the IT Manager read it. It is its own group
in the sidebar, not part of Rota, Box office or Money, and holding it opens nothing in those.

## If something goes wrong

- **"The incident report could not be read."** or **"The performance report could not be
  read."**: the figures did not come back, or your role no longer reads reports. Change the
  period and back to read it again; if it keeps happening, check your role under
  [roles and permissions](/docs/getting-started/roles-and-permissions).
- **"That season does not exist"**: the season chosen was removed while the screen was open.
  Reload the page and choose again.
- **TERM or SEASON is not in the list**: nobody has defined a term yet, or no season exists.
  A term is defined by the Treasurer on the [periods](/docs/money/periods) screen and a season by
  the Front of House Manager on the [seasons](/docs/box-office/seasons) screen.
- **The export opens an error instead of a file**: your sign-in has lapsed, or your role no
  longer reads reports. Sign in again, or ask the IT Manager about your role.

## Choosing a period

The period controls are the money dashboard's own, and they work the same way here.

1. **Period kind**: DAY, WEEK, MONTH, TERM, SEASON or YEAR. The screen opens on this year, which
   runs from {{ YEAR_START }} to {{ YEAR_END }} (month and day, London).
2. The controls the kind asks for: a date for a day or a week, a **Month** and a **Calendar
   year** for a month, and a list of terms, seasons or years for the rest. A **Year** reads as the
   two calendar years it spans, "2025/26".

Changing any of them reads both tabs again at once, and each tab goes back to its first page.
A performance belongs to the period its curtain time falls in, on the London calendar.

## The Incidents tab

One row for each venue, category and severity that had at least one entry in the period, with
how many there were. Every severity is counted, notes and near misses included. Nobody is named:
the tab counts entries and never shows what was written in them.

## The Performances tab

One row for each performance in the period, earliest first. A cancelled performance is left out.

- **Performance**: the show, with its date, curtain time and venue underneath.
- **Sold**: seats held against the performance.
- **Admitted**: tickets scanned in at the door.
- **No-shows**: tickets marked as not turning up.
- **Unfilled slots**: rota slots still open, or declined and not refilled.
- **Officer bypass**: Yes when an officer acted on tonight's screens (the door, the till or the
  duty manager's) without a shift on that performance. Only looking at a screen is not recorded.
- **Closed automatically**: Yes when nobody closed the night and its report was closed for them
  the next day.

On a phone, the last four columns are hidden; the export carries them all.

Opening the performances tab puts `?tab=performances` on the address, so a link to it opens on
that tab.

## Exporting

1. Choose the period.
2. On the tab you want, press **Export CSV**.
3. The file opens in a new tab or downloads, named for the tab and the range, for example
   `incident-trends-2025-08-01-to-2026-07-31.csv`.

The export is the whole period, not the page on screen. It is guarded against a spreadsheet
treating a cell as a formula, so a venue or show name beginning with an equals sign arrives as
text.

## What happens next

Reading a report writes nothing. Each export is recorded in the audit trail as "Cross-season
report exported", with which report, the range and how many rows, never the figures.

## Related pages

- [Safety](/docs/rota/safety)
- [Closing the night](/docs/tonight/closing-the-night)
- [Contacts and incidents](/docs/tonight/contacts-and-incidents)
- [Money](/docs/money)
