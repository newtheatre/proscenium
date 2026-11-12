# 0263: The committee may take any rota role untrained until a named night

- Status: Proposed
- Date: 2026-11-12
- Supersedes: 0259 (which widened the bar's gate alone)
- Amends: E-103 (who a shift is offered to), 0115 (what a duty manager shift needs) and 0210
  (what the gate admits), for as long as `SHIFT_COMMITTEE_UNTIL` stands

## Context

0259 let any committee member be put on a bar shift without the bar module until a named show
night, because few members held it in the first weeks after cutover. The IT Manager asked on
12 November 2026 for the same override to cover the other rota roles: the door (`ADMN-103`) and
the duty manager (`ADMN-201`), which have the same gap.

The duty manager already needs a live committee role beside its module (0115). The override must
not open it to anybody off the committee who happens to hold the module: it only lets the
committee role stand in for the training, never the other way round.

## Decision

1. **The setting is renamed `SHIFT_COMMITTEE_UNTIL` and covers every shift role.** It still ships
   empty (null), which is off. While the current show night (0014) is on or before it, a member
   with a live committee role, as 0115 reads one (`COMMITTEE_ROLES` on a usable account, never
   `ADMIN` alone), qualifies for a bar, door or duty manager shift whether or not they hold its
   module, and whatever the module's own standing. Clearing it, or letting the night pass, ends it.
   Migration 0140 moves a stored value from `BAR_SHIFT_COMMITTEE_UNTIL` to the new key unchanged.
2. **The committee role is an alternative to the role's whole gate, never a weaker part of it.**
   `holdsGate()` reads the gate as it stands, or a live committee role: for the bar and the door
   that is the module or the role; for the duty manager, whose gate is already the module and the
   role, it comes to the role alone. Somebody off the committee is gated exactly as before.
3. Everything else in 0259 stands: the alternative rides the conditional write of every claim,
   assignment, add and approval, for performances and bar openings alike; the live checks,
   suggestions, readiness count and staffing card read the same rule; a shift confirmed while it
   stood is kept after it ends, and a queued claim approved after the end is re-gated.

## Consequences

- An untrained committee member can run the door or be the duty manager until the night named.
  The duty manager is the night's safety lead (E-111), so this is the larger risk, and the
  committee owns it while the setting stands.
- A night set under the old key keeps working once migration 0140 runs; between the deploy and
  the migration the override reads as off.
- Once the setting has passed and stayed unused, the key and this record's code can be removed in
  one change, superseding this record.
