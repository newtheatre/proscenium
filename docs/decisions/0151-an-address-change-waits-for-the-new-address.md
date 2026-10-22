# 0151: An address change waits for the new address

- Status: Proposed
- Date: 2026-10-21
- Supersedes: A-115 criterion 1 (the address changes at once and the account is unverified again)

## Context

Changing the sign-in address swapped `users.email` the moment it was asked for, marked the account
unverified and ended every other session. Driven on 21 Oct 2026 this did three bad things:

- A typo in the new address left the person unable to sign in by password (unverified at both the
  old and the new address), and every emailed link went to the typo.
- The old address was never told. A borrowed session could move the account to an attacker's
  address, and the owner would find out only when they could not sign in.
- The owner of an address already in use was told "Someone tried to register with this address",
  though nobody had registered.

## Decision

**Asking issues a link to the new address and moves nothing.** The `EMAIL_VERIFY` token is bound to
the new address, as it already was (`auth_tokens.email`), and that token is the pending change: no
column is added. The account keeps its address, verification and sessions. Two messages go out:
`account.email.confirm` to the new address, sent by address since no account owns it yet, and
`account.email.requested` to the current one.

**Opening the link is the change.** `POST /api/auth/verify` with a token bound to an address other
than the account's moves the account there, marks it verified, ends every session (re-sealing the
one opening the link, if it is the same account), and sends `account.email.changed` to the old
address. If the address was taken in the meantime it refuses with 409 and changes nothing.

A clash warns the address's owner with its own message, `account.email.taken`, not the
registration one. The requester's answer is unchanged, so nothing enumerates.

`GET /api/account/email` returns the address and any pending one, which the profile shows.

**A pending change can be withdrawn.** `DELETE /api/account/email` deletes the bound token, so its
link then answers 410, and audits `account.email.change.cancelled`. The profile's waiting notice
offers it as **Cancel this change**, and `account.email.requested` links straight to it
(`/account/profile#email`). A change the owner did not ask for came from a session they do not
hold, so cancelling also bumps the session epoch, ending every other session and re-sealing the
one that cancelled; otherwise the borrowed session would simply ask again.

**Every change to how the account is secured ends a pending change too**, deleting its token in
the same batch: setting or changing the password, a password reset, confirming or removing the
authenticator, removing a sign-in method, and an officer's sign-out everywhere, authenticator
reset or disable (so enabling again revives nothing). A password set or changed while a change is
waiting also bumps the epoch and re-seals the caller, since that is the owner answering the
warning. An owner who follows the warning's advice to change their password therefore cancels the
change and ends the session that asked for it, without having to find either.

## Consequences

- A typo costs nothing: the link never arrives and the old address still works.
- Asking twice replaces the first link, as before.
- The audit trail gains `account.email.change.requested` and `account.email.change.cancelled`;
  `account.email.changed` is now written when the link is opened.
- Someone who changes their password while waiting on their own address change asks for it again.
