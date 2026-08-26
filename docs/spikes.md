# Spikes

Time-boxed investigations. Each has a question, a method, a deadline and an acceptance test for
the answer. A spike that misses its deadline reports what it has; silence is not an answer.

## SP-1: SumUp reader API feasibility

- **Question:** does the SU's SumUp account permit API-initiated checkouts on the physical
  reader, so the till can push the amount instead of a human retyping it?
- **Method:** identify the reader model and account type with the SU; read SumUp's reader API
  terms; if plausible, request sandbox access through the SU.
- **Deadline:** 4 September (gates the till design in Phase 2).
- **Acceptance:** a written yes/no with evidence. Yes means the till integrates with the typed
  cross-check as fallback; no means the cross-check is the flow, as the old estate proved works.

## SP-2: SU membership roster access

- **Question:** can the system read the SU's member list for this society (export, API, or a
  scheduled report) to drive membership status automatically?
- **Method:** ask the SU activities team; establish format, cadence and data-sharing terms.
- **Deadline:** 11 September (does not gate the build; manual grants are the fallback).
- **Acceptance:** a sample file or endpoint, or a documented refusal.

## SP-3: export tooling and first migration dry-run

- **Question:** can all four production databases be exported, transformed and loaded into the
  unified schema with row counts, money totals and register checksums reconciling?
- **Method:** build the export scripts against production backups (not live databases); run one
  full dry-run into a throwaway schema; publish the reconciliation report.
- **Deadline:** first dry-run by 13 September, then weekly.
- **Acceptance:** a reconciliation report where every discrepancy is explained or fixed. The
  incident, age-check and stock ledgers must reconcile exactly; anything else lists its
  tolerances.

## SP-4: passkey re-enrolment experience

- **Question:** what is the least annoying way to move passkey holders to the new relying-party
  id, given their existing credentials cannot cross domains?
- **Method:** count affected accounts in stage-door; prototype the first-login prompt; write the
  support copy.
- **Deadline:** 18 September (before identity goes live to members).
- **Acceptance:** a one-tap re-enrolment flow specification and a comms sentence for the
  cutover announcement.

## SP-5: database decision input

- **Question:** evidence for `decisions/0003`: do the unified system's transactional needs
  (ledger postings, capacity claims, register marking) justify PostgreSQL over staying on D1?
- **Method:** prototype the three hottest write paths on both; measure and, more importantly,
  count the workarounds each requires; cost the hosting.
- **Deadline:** 4 September (gates the ADR at the gate review).
- **Acceptance:** a one-page comparison the committee can decide from.

## Outcomes (recorded 26 August 2026)

All five spikes were answered by the committee on the day the package was circulated.

- **SP-1: refused.** The SU's SumUp merchant account does not grant the society developer
  toolkit access. Reader-initiated checkout will not be built; the typed expected-total
  cross-check is the permanent flow (decision 0005 amended; D-205 and F-201 resolved as
  won't-build).
- **SP-2: no direct or automatic access.** Membership is maintained by manual grant, with a
  periodic manual import of any list the SU can export on request (A-201 amended accordingly).
- **SP-3: confirmed as build work.** No off-the-shelf path exists; the export, transform and
  reconciliation tooling is written by this project, in this repository, against production
  backups. First dry-run deadline unchanged (13 September).
- **SP-4: trivial.** Exactly one account holds passkeys. No legacy-passkey import or
  re-enrolment flow is built; legacy passkey rows are not migrated and the one holder re-enrols
  manually after cutover (decision 0008 amended; A-106 resolved as won't-build).
- **SP-5: D1 stays.** Hosted PostgreSQL is prohibitively expensive for the society and D1's
  batch atomicity is sufficient for our needs. Decision 0003 rewritten: the unified system runs
  on D1 and carries the estate's proven D1 disciplines.
