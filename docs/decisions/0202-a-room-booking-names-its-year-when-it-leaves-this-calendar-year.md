# 0202: A room booking names its year when it leaves this calendar year

- Status: Proposed
- Date: 2026-10-21
- Amends: copy-style section 9 (a single date shows its year only outside the committee year) for room bookings

## Context

A single date shows its year only when it falls outside the committee year in hand (0009, kept for
single dates by 0117). Inside the committee year that hides a year the reader cannot do without on
the rooms screens. A room can be booked twelve weeks ahead, and a series runs on from there, so in
October a booking for 1 February 2027 read "Monday 1 February" in the toast after booking and on My
bookings, and a refused date of a series read as a bare "2026-11-05" (rooms hands-on review, 21
October 2026). A reader planning a term thinks in calendar years: "February" in October means next
year, and the screen should say so rather than leave it to be worked out.

## Decision

**A room booking's date names its year whenever it falls outside the calendar year the reader is
in.** `WhenOptions` in `shared/utils/when.ts` takes `calendarYear: true`, which makes the year test
the calendar year rather than the committee year; an explicit `year` still wins. The booking form
(the toast after booking or asking, and the dates a series lists as refused or needing a decision)
and My bookings (every booking's and Students' Union request's span) pass it. Nothing else changes:
every other screen keeps the committee-year rule.

## Consequences

- In October, "Monday 1 February 2027" on the rooms screens and "Mon 1 Feb" for the same date on,
  say, a pass's expiry. The two rules differ on purpose, and a screen opts in by passing the option.
- From January to July the calendar-year test hides a year the committee-year test would also hide,
  and from August to December it adds the year for anything after New Year, which is the case the
  review found.
- The test is the reader's clock, as `saysDayRange()`'s is (0117), so the server and the browser
  agree except across midnight on 31 December.
