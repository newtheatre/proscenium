# 0117: A span of days names its year when an end leaves this calendar year, and every date is built from numbers

- Status: Proposed
- Date: 2026-10-14

## Context

The two date shapes (copy-style §9) drop the year inside the committee year in hand, because a
year there is noise. That rule was written for one date. Applied to each end of a span it gave
"Mon 8 Sept 2025 to Thu 3 Sept" on the pass types screen (it reads as ending before it begins),
"Thu 1 Oct to Sun 31 Jan" for a term and "Fri 1 Jan to Fri 12 Feb" for Spring 2027 in October
2026, none of which a reader can place without the year (hands-on review, 13 October 2026).

The same review found every dated page logging a hydration mismatch: the server rendered
"Tue 13 Oct" and the browser "Tue, 13 Oct". `saysDate()` asked `Intl.DateTimeFormat` for the
weekday, day and month together and took the locale's joined string, and the ICU data in a
browser puts a comma after the weekday where the server's does not.

## Decision

**A span of days is said by `saysDayRange()` in `shared/utils/when.ts`.** When both ends fall in
the calendar year the reader is in, neither carries a year. When either end falls outside it, the
year is shown: once, at the end, when both ends share a year ("Fri 1 Jan to Fri 12 Feb 2027"), and
at both ends when they do not ("Thu 1 Oct 2026 to Sun 31 Jan 2027"). The test is the calendar year
rather than the committee year, because a span is read as one phrase and the year a reader needs
is the one printed on a calendar. A single date keeps the committee-year rule unchanged.

**Every date shape is built from numbers, never from the locale's joined string.** The London
year, month and day come from `londonParts()`, the weekday from that day, and the names from
fixed lists in `when.ts`, so the server and every browser render the same characters. The short
month for September is "Sept", the form the server's ICU already used.

## Consequences

- Screens that wrote `${saysDay(a)} to ${saysDay(b)}` call `saysDayRange(a, b)` instead. A span
  shown with `{ year: true }` on both ends already names its years and is unchanged.
- Month and weekday names no longer follow the runtime's locale data. The product is British
  English only (copy-style), so nothing is lost.
- `formatLondon()` stays the mechanism for clocks and for the few allow-listed callers in
  `tests/unit/design-language.test.ts`; two room screens that built a joined weekday shape leave
  that list.
