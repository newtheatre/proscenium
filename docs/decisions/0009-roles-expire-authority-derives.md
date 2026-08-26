# 0009: Roles expire at the committee year; operational authority derives from facts

- Status: Accepted
- Date: 2026-08-26

## Context

The committee turns over yearly. The old estate's two best access-control ideas were
committee-year role expiry (31 July, Europe/London, enforced at read time) and derived
operational authority: the till opened to tonight's confirmed bar shift, trainer standing
derived from a current certification, comp approval belonged to tonight's duty manager.
Nothing needed remembering to revoke.

## Decision

Both patterns are load-bearing in the unified system. Officer and lead roles default to expiry
at committee year end, warned 14 days ahead, with permanent grants exceptional and reported.
Operational authority is always derived: a rostered shift for tonight (the show night runs
04:00 to 04:00 London), a currently-valid training record, or a production-scoped assignment.
No permission may be granted as a workaround for a missing training record; the fix is the
record.

## Consequences

- The last-administrator guard carries: no action may leave the system without a usable
  administrator.
- MFA is compulsory for any role touching money, personal data or safety records.
- Role-to-permission mapping from the four old namespaces to the unified officer model is a
  written table agreed in the workshops and applied by the Phase 1 import.
