# 0181: A reserved email domain is refused at registration

- Status: Proposed
- Date: 2026-10-21
- Amends: A-101 criterion 3 (an undeliverable address gets the ordinary answer and no account)

## Context

Registration answers every address the same way, so nobody can learn whether an address already
has an account. An address no message could reach got that same answer, "Check your email", and
no account. A student who typed `.test` or `.invalid` for their domain waited for an email that
would never come, and no send-log row existed for the IT Manager to find.

## Decision

**An address on a domain reserved by RFC 2606 or RFC 6761 is refused on the form and by the route,
with "That address cannot receive email. Check the part after the @."** `hasReservedDomain` in
`shared/utils/deliverability.ts` is the one test, read from the same lists `undeliverableReason`
already keeps.

A reserved domain is a fact about the address itself, never about whether an account holds it, so
saying so leaks nothing and enumeration safety is unchanged. A placeholder address (`deleted-…@`,
`merged-…@`) still gets the ordinary answer and no account, since its shape is ours, not a typo.

## Consequences

- A mistyped reserved domain is corrected on the spot.
- Test suites register on a real domain (`e2e.newtheatre.org.uk`) already, so nothing changes there.
