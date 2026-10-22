# 0180: One bar's close replacing another bar's reading is flagged

- Status: Proposed
- Date: 2026-10-21
- Amends: 0097 (a till's reading supersedes a till's) by what the Treasurer is shown, not the rule

## Context

A night's Z reading is one figure for every bar, and each till close records the reader total it
was given. Under 0097 a later close at any bar supersedes an earlier close's reading, and a reading
recorded on the reconciliation screen always stands. On 21 Oct 2026 a volunteer closed the wrong
till with £1.50 against £247.35 expected; a later close at another bar replaced it with a matching
figure, so no screen flagged the night, and the History showed a £245.85-short row with nothing to
say where it came from or why it no longer counted.

## Decision

**The rule stays; the screen says what it did.**

- Each reading in the History names where it came from (a bar's till close, or recorded here) and
  what replaced it (another bar's close, a reading recorded here, or a write-off).
- A night whose live reading came from one bar's close over a **different** figure from another
  bar's close is listed on **Needs you** as **Reading replaced**, once every till that night is
  closed. A night with an open variance is listed as that instead, never twice.
- It clears when the Treasurer records a reading of their own, even the same figure: that reading
  is the confirmation, and it stands over any later close as it already did.
- While any till for the night is open, the reconciliation screen says so above Record, since a
  reading recorded then stands over that till's close.

## Consequences

- A matching figure from the wrong bar is checked by a person rather than trusted by chance.
- The flag is read from `z_readings` and `till_sessions` alone, with no bound parameters, so it
  stays inside 0006 however many nights it covers.
- Recording a confirmation adds a row to the night's history; nothing is edited (0010).
