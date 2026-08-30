# 0030: The old estate's audit history is not imported

- Status: Accepted
- Date: 2026-08-30

## Context

K-112 criterion 2 said the old audit log imports as a read-only archive, and the identity transform
built the rows for it: 112 entries, 71 from stage-door and 41 from rehearsal, across 27 distinct
actions. `docs/data-model.md` documented an `audit_archive` table to receive them, against J-108.
Building the load made us look at what those rows actually contain, and the answer changed the
decision.

**They cannot go into `audit_log`.** The catalogue closed in 0027: an action must be registered
before it can be written, and registering one is a decision about this system. These are 27 actions
belonging to features this system does not have, and mostly never will in that shape:
`app.manifest-applied`, `role-definition.adopted`, `service-token.issue`, `session.register.open`,
`record.signoff`. Adding them would make the catalogue a museum, and the audit screen's module
filter would have to grow a category for another estate.

**Their details are the thing the live trail refuses.** The detail keys across those 112 rows
include `name`, `note`, `reason`, `why`, `error` and `warning`: precisely the free-text keys
`guardDetail` rejects, because audit detail carries identifiers and never people (0011). Importing
them would put unvetted free text about members into the trail, and J-102 criterion 4 promises that
after an erasure no entry, native or archived, can reproduce that person's name or email.

**A separate archive table does not escape that.** It would be a permanent table of another
system's free text about people, which erasure would have to reach correctly, including rows where
the person is the subject rather than the actor. For 112 rows from an estate being retired, that is
a poor trade.

## Decision

**The old estate's audit history is not imported.** `audit_archive` leaves `schema-core.sql`, the
transform and `docs/data-model.md`; `reconcile.ts` checks that nothing has quietly started building
it again.

The history is not destroyed. The old estate stays readable until it is archived, and the
reconciliation reports record what was left behind and why. What the unified system holds from the
day it opens is its own trail, written under its own rules.

## Consequences

- K-112 criterion 2 loses its archive clause; J-108, whose whole subject was importing and
  surfacing that archive, is superseded. Both carry dated amendments pointing here.
- A question about a governance decision taken before cutover is answered from the old estate's
  archive, not from this system. That is a real cost, accepted knowingly: it is 112 rows, and the
  alternative is a standing obligation on every erasure from now on.
- If a specific historical entry ever has to be carried across, the path is a manual entry through
  J-103, signed by the officer who transcribes it and naming people by account reference only
  (0028). That is slower, deliberate, and leaves a better record than a bulk import would.
