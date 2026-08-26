# 0007: Sessions are first-party sealed cookies with epoch revocation

- Status: Accepted
- Date: 2026-08-26

## Context

The old estate's sealed-cookie session worked well; its weaknesses were all about crossing
apps: a 15-minute role staleness window on privileged surfaces and up to 30 days on
unprivileged reads, because consumers could not see revocations.

## Decision

One first-party sealed session cookie, 30-day maximum age, with a per-user session epoch: any
security-relevant change (password, email, factor enrolment, disable, force logout, role
removal from a privileged role) bumps the epoch and re-seals the actor's own session where it
should survive. Privileged requests verify the user row (existence, enabled, epoch) on every
request; there is no staleness window because there is no second application.

## Consequences

- Revocation is effectively immediate on all surfaces; the old accepted risk dissolves.
- A fresh-session gate (10 minutes) guards account linking and closure, carried from the old
  design.
- No server-side session store is introduced; a per-device session list stays out of scope
  until a real need appears.
