# ADR-0022: Access needs are special category data, visible only to the people working that night

**Status:** Accepted · **Date:** 2026-08-21 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

The access system ([12-access-and-staffing §2](../12-access-and-staffing-design.md)) records what a
customer needs from the building: level access, a companion seat, information in a different form.
These are operational statements, not diagnoses, and the design deliberately never records a
diagnosis. But "needs level access" still tells you something about a person's health, and the
distance between that and special category data under UK GDPR Article 9 is not one to argue in front
of a regulator.

The theatre also has an operational reality to serve: the volunteer on the door at 19:20 genuinely
needs to know that the party arriving uses a wheelchair, or the whole exercise is paperwork.

## Decision

**Treat it as special category data and take the strict path.** Lawful basis is explicit consent
under Article 9(2)(a), captured at request time, timestamped in `consent_foh_at`, and expressed to
the user in plain terms: the staff team working any performance you book will be able to see your
access requirements on the night, so they can meet them.

**The visibility rule, enforced server-side, is narrow by construction.** A profile's needs are
readable only by:

1. Staff with a **confirmed shift** on a performance the profile's owner **holds a booking for**, on
   the **day of that performance** — all three clauses, using the same shift test as
   [ADR-0019](0019-the-rota-scopes-the-front-of-house-role.md); and
2. Holders of `access.verify`, which is one or two people and deliberately not part of `BOX_OFFICE`.

Nobody else. General `BOX_OFFICE` is not on this list, which is unusual in this app and intended:
selling someone a ticket is not a reason to read their access needs. The backstage code session
([ADR-0020](0020-backstage-joins-by-a-nightly-code.md)) has **no path** to this data at all, which
is a stronger property than not being granted it.

**Evidence is viewed, never stored.** The verifier looks at whatever the person offers — a Nimbus
card, a letter, a conversation — and records only the conclusion, in the nine Access Card symbols.
No document, scan or photograph enters the system, and there is nowhere to put one.

**Withdrawal is unconditional and immediate**: status becomes `WITHDRAWN`, the needs data is
deleted, future bookings stop offering access ticket types, and already-issued companion tickets
stay valid. Withdrawal is not a penalty.

**The estate hooks are part of the feature.** The profile joins the subject-access `export` hook, is
**deleted** rather than anonymised by the `anonymise` hook, and its user columns join `mergeUser`
([ADR-0025](0025-every-user-reference-joins-the-estate-hooks.md)). An access profile that survives an
erasure is the worst bug this system can have, and it is the one an erasure test must cover.

## Alternatives considered

- **Free-text access notes on the booking**, which is what most small venues do. Re-collected every
  booking, unstructured, unreportable, and it invites people to write a diagnosis into a field the
  door can read.
- **Legitimate interests as the basis.** Available for ordinary personal data and not worth relying
  on for Article 9 material when the alternative is a consent tick the user is going to give anyway,
  because they want the door to know.
- **Visible to all staff.** Simpler to build and impossible to justify. It also removes the one
  sentence that makes the consent copy honest.

## Consequences

- **The rota is a data-protection control, not just a rostering convenience.** Loosening the shift
  test loosens access to Article 9 data. Anyone changing it should read this record first.
- The end-of-night report carries access bookings as **counts only** — never names, never symbols
  ([12-access-and-staffing §4.3](../12-access-and-staffing-design.md)) — because a report is emailed
  and archived, and neither is a place this data can live.
- Retention needs a line in the Workspace & Data Retention Policy, which lives in stage-door. That is
  a cross-repo prerequisite, not an afterthought.
- The consent copy is user-facing text with legal weight. Change it in the same commit as the thing
  it describes, or it stops being true.
