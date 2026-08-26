# 0015: Migration is a keyed merge with a module-phased cutover

- Status: Proposed
- Date: 2026-08-26

## Context

Every existing application already keys people by the canonical stage-door id, so joining four
databases is a keyed merge, not entity resolution. The theatre performs weekly during term, so
a big-bang cutover of show night is not survivable; but the committee has set cutover for
31 October 2026, which is mid-season.

## Decision

Identity imports first and re-runs weekly from fresh exports. Modules cut over in order of
stakes: rooms (28 September, pilot), training and rota (5 October), box office and passes
(12 October), show night and bar last. During the transition a show is assigned to one system
for its whole run: door and money follow the show's system, so no single night splits across
two records. The season's first shows run on the old system with the new door screen and till
in shadow alongside (at least three nights, reconciled nightly); shows from the week of
26 October are authoritative on the new system; final import from frozen exports on
31 October; the old estate goes read-only on 1 November and can be re-armed within a day as
the rollback for the rest of the season.

## Consequences

- Money history, licensing registers and training records import checksummed with reconciled
  totals; the incident and age-check registers must reconcile exactly.
- The documented data repairs (bar container sizes, zeroed stocktakes, double-voided tabs,
  placeholder-email customers) run against the live estate in September, before first export.
- Amended 26 August at committee direction: the new schema carries **no legacy-id columns**.
  This is a blank-slate start that keeps the data, not the identifiers: imported rows take
  fresh ids, and the source-to-new id mapping lives only in the migration tooling's working
  artefacts, kept alongside the read-only old estate for the parallel-run window and archived
  with it. Historical questions are answered by the reconciliation reports and the archived
  old estate, not by columns in the live database.
