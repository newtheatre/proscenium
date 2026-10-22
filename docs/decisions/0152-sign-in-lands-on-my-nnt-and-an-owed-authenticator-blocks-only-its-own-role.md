# 0152: Sign-in lands on My NNT, and an owed authenticator blocks only its own role

- Status: Proposed
- Date: 2026-10-21
- Amends: 0094 (where sign-in lands), A-112 (what a missing second factor refuses)

## Context

Driven on 21 Oct 2026, every sign-in, emailed link, reset and confirmation with no `next` landed
on the public home page. A first-time volunteer saw the marketing page and wondered whether it had
worked. An officer whose role needs an authenticator found out only when each screen refused them.

A Treasurer who also held Committee, with no authenticator, was refused `/reports`, which the
Committee grant alone opens: `requirePermission` refused *any* permission while a privileged grant
waited on its factor, so one pending grant blocked the rest.

## Decision

**With no `next`, sign-in lands on My NNT.** Somebody on a shift in its window still lands on
Tonight (0094). Somebody holding a privileged role by password with no confirmed authenticator
lands on Security, where the card naming the role's need is the first thing below the ways in.
The session answer carries this as `authenticatorOwed`; the Google route asks the same question,
though a Workspace account is exempt and never owes one.

**An owed authenticator refuses only what its role adds.** When the factor is owed,
`requireSecondFactorIfPrivileged` works out the permissions of the caller's non-privileged grants.
If the permission a route needs is among them, the request goes on holding **only** those
permissions, so a handler that reads `resolved.permissions` for more cannot reach the privileged
role's. Otherwise it refuses as before. The console overview and waiting counts narrow the same way.
Call sites that pass no permission still refuse outright.

Sign-in copy around this: the recovery-code form is headed "Use a recovery code"; a used recovery
code is followed by a notice of how many are left; the rate limit says how long to wait; a refused
password also says to ask the IT Manager if the emailed link does not help.

## Consequences

- Nothing a privileged role opens is reachable without its factor, as before.
- An officer keeps the committee screens while setting up an authenticator, instead of losing them.
