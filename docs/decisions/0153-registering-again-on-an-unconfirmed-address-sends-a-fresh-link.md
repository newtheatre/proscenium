# 0153: Registering again on an unconfirmed address sends a fresh link

- Status: Proposed
- Date: 2026-10-21
- Amends: A-101 criterion 2 (an address already registered learns so by email)

## Context

Registering on an address that already has an account sends "You already have an account … sign
in as usual" to it, so the form cannot be used to test who is a member. Driven on 21 Oct 2026, a
person whose first confirmation email went missing registered again and got that message. But a
password sign-in is refused until the address is confirmed (0026), and the message carried no
link, so they were sent in a circle.

`POST /api/auth/verify/resend` existed, enumeration-safe and rate limited (0103 kept it), but
nothing in the app called it.

## Decision

**An account registered but never confirmed is sent a fresh confirmation link** when its address
registers again, the same `account.verify` message the first registration sent. The answer on
screen is unchanged, so nothing enumerates. A confirmed account still gets "You already have an
account", and an account with no way in still gets the claim link (A-116).

**The "Check your email" screen offers "Nothing arrived? Send the link again"**, which calls
`POST /api/auth/verify/resend` with the address just typed; its own rate limit applies.

The **Create my account** button stays disabled until the page has hydrated, so an early click
is never lost without a word, and shows that it is working once pressed.

## Consequences

- The resend route now has a caller, so it stays.
- The second registration's name and password are ignored, as before; the first registration's
  password is the one that works once the address is confirmed.
