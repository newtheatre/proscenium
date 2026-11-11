# 0259: The committee may staff the bar untrained until a named night

- Status: Proposed
- Date: 2026-11-11
- Amends: E-103 (who a bar shift is offered to) and 0210 (what the gate admits), for as long as
  `BAR_SHIFT_COMMITTEE_UNTIL` stands; extends 0115's reading of "a committee role"

## Context

A bar shift, at a performance or at a bar opening, is gated on the bar module
(`SHIFT_ELIGIBILITY_BAR_MODULE`, `ADMN-102` as shipped). In the first weeks after cutover few
members hold it yet, so bar slots go unfilled while committee members who already run the bar are
locked out of the rota for want of a record. The IT Manager asked on 11 November 2026 for a
temporary override letting any committee member be put on a bar role without the training.

Turning the bar module off is no answer: an unset rule refuses everybody (E-103 criterion 4).
Granting the committee the module would write training records nobody earned into an append-only
table (0010), and they would outlive the stopgap. The override has to widen the gate itself, end on
its own, and be switched off without a release.

## Decision

1. **A new setting, `BAR_SHIFT_COMMITTEE_UNTIL`, names the last show night of the override.** It
   ships empty (null), which is off. While the current show night (0014) is on or before it, a
   member who holds a live committee role, as 0115 reads one (`COMMITTEE_ROLES` on a usable account,
   never `ADMIN` alone), qualifies for a bar shift whether or not they hold the bar module, and
   whatever the module's own standing. Clearing the setting, or letting the night pass, ends it.
2. **It widens the bar gate only, on every path the gate already rides.** `shiftGate()` carries
   the committee alternative for `BAR` when the override stands, so the claim, the officer's
   assignment, adding a shift with somebody on it, and the approval of a queued claim all admit a
   committee member in the conditional write itself (0003), for a performance's bar shift and a bar
   opening's slot alike. The live checks (`shiftEligibilities()`, `candidateLock()`), the
   assignment suggestions, the readiness count and the account's staffing card read the same rule.
   The door and the duty manager are unchanged.
3. **It decides who may be put on a shift, when they are put on it.** A shift confirmed while the
   override stood is kept after it ends, as one confirmed before a training record lapses is; what
   the shift opens on the night is the confirmed shift itself (0009, E-111), and the till asks
   nothing more. A queued claim approved after the end is re-gated and refused as any lapsed claim
   is (E-105 criterion 3).

## Consequences

- An untrained committee member can work the bar until the night named. The committee owns that
  risk while the setting stands; the bar module is still what a non-committee member needs.
- The override shows on Settings with its night, and its changes are audited as any setting is.
  Nothing announces that it has ended: the bar's suggestions simply narrow to the trained.
- Once the setting has passed and stayed unused, the key and this record's code can be removed in
  one change, superseding this record.
