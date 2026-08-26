# 0011: Erasure is anonymisation in one transaction

- Status: Accepted
- Date: 2026-08-26

## Context

The old estate's GDPR model was sound but distributed: erasure fanned out over hooks that
retried, tombstones guarded mirrors against resurrection by stale cookies, and completeness
was a property you monitored rather than a property you had.

## Decision

Erasure is a single database transaction: identity columns rewritten to derived tombstone
values, free text about the person scrubbed everywhere it lives, consent-based data (access
profiles, marketing consent, practice history) deleted outright, and statistics (sales,
attendance, safety records, bookings) preserved as anonymous rows. The tombstone guard
carries: no code path may write identity back over an anonymised row, and a still-valid
session cannot resurrect one. Export is the same shape: one bundle from one query set.
Retention automation (2 years inactive full accounts with two warnings, 3 years guests)
ships computing in dry-run and requires an explicit audited arming; role holders, active
members and people with unsettled money are exempt.

## Consequences

- Completeness is transactional; there is no incomplete-erasure state to re-drive.
- The scrub list (which columns hold personal free text) is maintained as schema metadata so
  a new column cannot be forgotten; CI checks that every free-text column is classified.
