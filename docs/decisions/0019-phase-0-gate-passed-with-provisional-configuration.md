# 0019: The Phase 0 gate passed with provisional configuration defaults

- Status: Accepted (committee approval, 26 August 2026)
- Date: 2026-08-26

## Context

`roadmap.md` set the Phase 0 gate at 6 September 2026 and defined it as three signatures: the
committee signs the backlog scope, accepts or amends the decision records, and confirms the
configuration defaults. Until all three, no product code belongs in this repository.

Approval came on 26 August, eleven days early, for the first two only. The configuration
workshops in the week of 31 August are committee time and cannot be pulled forward, and the
committee's direction was that the build should not wait on them. Without this record, a
successor reading `roadmap.md` finds an application whose first commits predate the gate it
describes and has no way to tell an approval from a rule someone ignored.

## Decision

The Phase 0 gate is passed as of 26 August 2026. The backlog scope is signed and the decision
records are accepted; records 0002, 0015, 0016 and 0017 move from Proposed to Accepted on that
date and are not editable thereafter.

The third signature is deferred, not waived. Every operational rule ships with the proposed
default recorded in `workshops.md`, which is what the standing rule in that register already
prescribes for a value nobody confirms. A setting whose register row names no proposed default
ships unset with a named owner and is not invented in code. The workshops still happen in the
week of 31 August; what they produce are settings changes under 0012, not releases, and this
record is not reopened by them.

## Consequences

- Product code may land from 26 August. The Phase 1 foundations work begins against a
  configuration surface whose values are provisional but whose keys and enforcement are not.
- Any number the system enforces before its workshop confirms it is enforcing a default the
  committee proposed, never one the build chose. Where the two differ, the settings surface
  reconciles them without a deploy.
- The pass products, per-room opening hours, night report recipients and the role vocabulary
  mapping have no proposed default and therefore block the features that need them: the Phase 1
  user import waits on the role mapping, as `roadmap.md` already records.
- The gate's own condition, that no product code precede it, is discharged rather than broken.
  A successor auditing the first commits against the roadmap dates lands here.
