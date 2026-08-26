# 0005: Payment stays on the SU's SumUp flows

- Status: Accepted (external constraint; SP-1 outcome folded in, 26 August 2026)
- Date: 2026-08-26

## Context

Students' Union rules permit the society to take payment only through the SU-provided physical
SumUp card reader or the SU website. The committee declines the SU website. This is an external
constraint, not a design preference.

## Decision

All money is taken in person on the SumUp reader. The system computes what is owed, cross-checks
the figure the operator will charge, and records the outcome; it never initiates an online
charge and never touches card data. Every money-taking screen sends its expected total; a
mismatch with the server's computation refuses the action quoting both figures. SP-1 asked
whether the SU's SumUp account permits API-initiated reader checkouts; access to the merchant
developer toolkit was refused, so the typed cross-check is the permanent flow, not a fallback,
and no reader integration is built (backlog D-205 and F-201 are resolved as won't-build).

## Consequences

- No PCI scope, no payment webhooks, no settlement feed; reconciliation is the daily Z-total
  cross-check (0004, module I).
- Online booking is reservation with an expiring hold, never a sale (module D).
- If the SU's rules ever change, online payment is a superseding record and a V-next project,
  not a patch.
