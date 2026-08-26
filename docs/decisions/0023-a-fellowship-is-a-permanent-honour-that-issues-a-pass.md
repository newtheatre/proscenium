# 0023: A fellowship is a permanent honour, and its entitlement is a pass

- Status: Accepted (committee direction, 26 August 2026)
- Date: 2026-08-26

## Context

The theatre awards fellowships to alumni who have made a significant contribution to it. A
Fellow has free tickets for life. The definition package missed this entirely, so nothing in the
backlog, the data model or the roadmap accounted for it.

Nothing already modelled fits. A role grant expires at the committee year end and exists to carry
operational authority (0009); a fellowship is permanent and carries none. A membership is a dated
yearly state bought at the SU (A-117); a fellowship is awarded, not bought, and does not lapse.
Inventing a third kind of standing grant would put a permanent entitlement next to a deliberately
expiring one, which is the confusion 0009 exists to prevent.

## Decision

A fellowship is recorded as an honour in its own right: who it was awarded to, when, by whose
authority, and the citation. That record is the theatre's, and it outlives any particular
ticketing arrangement.

**The entitlement rides the pass model.** Awarding a fellowship issues a pass of a reserved
`FELLOWSHIP` type at zero price and with no expiry. Everything the box office already does then
works unchanged: the door scans it like any pass, `pass_admissions` records each redemption
append-only and keeps it to one per performance, and the sale posts a zero-value ledger entry the
way companion tickets do (I-finance). No parallel free-ticket path exists to be forgotten when
the pass rules change.

**A free seat is still a seat.** The entitlement is admission at no charge, not priority and not
a guaranteed seat. A Fellow books like anyone else, the capacity predicate applies unchanged
(0006), and a sold-out house is sold out. Anything else would let an honour quietly oversell a
performance.

**Revocation is possible and recorded.** Rare, but a safeguarding matter has to be actionable. A
revoked fellowship stops future admissions and rewrites nothing: the award, the revocation and
every admission already taken all stand.

## Consequences

- The honour and the entitlement can move independently. If the committee ever changes what a
  fellowship confers, that is a change to the pass type, not to the roll of Fellows.
- The roll of existing Fellows lives in committee records rather than in any of the four
  databases, so it is assembled by hand and entered through the same path as a new award. The
  roadmap carries it as a committee input with a named owner, alongside the training catalogue.
- What a fellowship covers beyond our own productions, whether it extends to a guest, and how it
  survives an erasure request are unsettled. They ship as the proposed defaults recorded in
  A-127 and D-130, and a value with no proposal blocks its feature rather than being guessed
  (0019).
- A Fellow needs an account to hold a pass. Many are alumni with no reason to have one, so the
  guest account path (A-116) is on the critical path for this and not only for audiences.
