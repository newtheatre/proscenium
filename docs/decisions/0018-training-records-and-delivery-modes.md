# 0018: Training records semantics and delivery modes

- Status: Accepted
- Date: 2026-08-26
- Superseded in part by 0041: a stamped expiry is final, and recalculation is withdrawn

## Context

The old training application was the estate's best module and its semantics were earned:
records append-only, validity derived at read time, expiring counts as held, register marking
as the sole award path for taught sessions, absent means nothing at all. The committee adds a
requirement the old system never had: modules delivered as self-directed online learning
(open, quiz-assessed, with a question channel) and hybrids of online content plus in-person
assessment.

## Decision

The record semantics carry unchanged: append-only records; corrections by revoke-with-reason
plus re-grant; validity derived, never stored; expiry on the date; expiring counts as held
everywhere; expiry stamped at award with the previewed, count-confirmed recalculation as the
only retroactive path; academic-year expiry with the 60-day carry-over constant. Every module
declares a delivery mode: in-person (session, register, marks award), self-directed (quiz with
configurable pass mark and cooldown awards automatically, dated to the attempt), or hybrid
(the record awards only when both halves are complete). Safety-critical modules can never be
fully self-directed: a quiz may gate or complement the in-person assessed component, never
replace it. Every module can link external materials; links are owned by the department.

## Consequences

- Nothing on a timer ever awards, resolves or changes a record; sweeps notify and digest only.
- Trainer standing stays derived from a current trainer-granting certification.
- Delivery mode and material links land in the MVP schema; quiz assessment and hybrid
  completion are V2 features on that schema, so no migration is needed when they arrive.
