# 0014: Europe/London everywhere; the show night runs 04:00 to 04:00

- Status: Accepted
- Date: 2026-08-26

## Context

The server runs in UTC; the theatre runs in London. The old estate learned this the hard way
(a weekly booking drifting an hour at the clock change, email times wrong for half the year)
and encoded two good answers: pin Europe/London at every formatting and recurrence boundary,
and define the operational night as 04:00 to 04:00 London so a refusal logged at 00:20 belongs
to the evening still running.

## Decision

Both carry as system-wide rules. Instants are stored as UTC timestamps; every date the theatre
reasons about (recurrence arithmetic, the ledger's day, the Z-total's day, expiry dates, the
academic year boundary) is computed against Europe/London. The show night boundary is 04:00.
Daylight-saving transitions are named test cases: the October clock change, the spring
non-existent hour, an award on the academic-year boundary.

## Consequences

- One dates utility owns the arithmetic; a second implementation is a defect.
- The financial day and the operational night are defined terms in the data dictionary, not
  conventions.
