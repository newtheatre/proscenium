# 0153: Registering again on an unconfirmed address sends a fresh link to choose a password

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

**An account registered but never confirmed has its password cleared, and is sent the claim
link** when its address registers again: the `account.claim` message A-116 sends, worded for an
unconfirmed registration, to choose a password. Nobody has proved the mailbox, so the first
password is as likely a stranger's as the owner's; sending a fresh confirmation link instead
(as first drafted) let a stranger register an address first and keep a working password once its
owner confirmed it. Clearing the password also bumps the session epoch. The answer on screen is
unchanged, so nothing enumerates. A confirmed account still gets "You already have an account",
and an account with no way in still gets the claim link.

**The "Check your email" screen offers "Nothing arrived? Send the link again"**, which calls
`POST /api/auth/verify/resend` with the address just typed; its own rate limit applies.

The **Create my account** button stays disabled until the page has hydrated, so an early click
is never lost without a word, and shows that it is working once pressed.

## Consequences

- The resend route now has a caller, so it stays.
- Neither registration's password survives a second registration: whoever holds the mailbox
  chooses one from the link. A person who simply lost the first email chooses their password
  again.
- A confirmation link from the first email still confirms the address, but leaves no password, so
  it signs nobody in by password.
- Clearing the password is audited as `password.cleared`, with no actor, since nobody signed in
  asked for it.
