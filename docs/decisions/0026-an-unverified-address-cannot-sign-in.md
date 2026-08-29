# 0026: An unverified address cannot sign in, and expires

- Status: Accepted
- Date: 2026-08-29

## Context

Registering by hand turned up an account that could be signed into immediately, having proved
nothing. A-101 criterion 4 says the account is not usable until the address is verified, and
A-102 criterion 2 says nothing but verification, claim and reset messages may reach an unverified
address. Neither was enforced at the sign-in path, so an unproven address held a working account
that we could never write to.

That also left a population nothing owns. A-126 warns dormant accounts before anonymising them,
but a warning is exactly the kind of message A-102 forbids to an unverified address. Every
never-completed registration would sit in the sweep's way, permanently, generating warnings that
may not be sent.

## Decision

**An unverified address cannot sign in with a password, and an account that stays unverified
expires.**

The refusal is generic. `verified` joins the expression in `server/api/auth/sign-in.post.ts` that
already decides this inside the constant-time branch, so an unverified account, a disabled one, a
wrong password and an unknown address remain one status and one body. A-103 criterion 1 is kept
whole rather than gaining an exception.

This is not a dead end, because **three of the four things that mark an address verified are
reachable by somebody who never got the first email**:

| Route | What proves the mailbox |
| --- | --- |
| The verification link | the message itself |
| A magic link | consuming it |
| A password reset | consuming it |
| Google | the Workspace identity |

Only the first depends on the email that went missing. `/sign-in` carries a standing "I did not get
my confirmation email" step posting to `/api/auth/verify/resend`, which is already enumeration-safe
and rate limited, so the way back is on the screen rather than in the refusal.

**Expiry goes through the A-125 path.** An account unverified past `UNVERIFIED_ACCOUNT_DAYS` is
anonymised by `eraseAccount(id, null)`, the same code that a person's own closure uses, attributed
to the system. Erasure is anonymisation and never row deletion (0011), and A-126 criterion 6 is
satisfied in advance rather than separately.

**A shadow account is exempt.** An account holding no password was created from the console or as a
guest and was never anybody's registration to complete; A-116 owns claiming, and it owns the expiry
that goes with it.

**The sweep ships armed, capped at `UNVERIFIED_EXPIRY_CAP` per run.** A-126 ships dry-run because it
touches accounts people use. These accounts were never used at all, so the argument does not carry
across. The cap is what keeps the first run after the membership import from anonymising thousands
in one pass, and keeps any mistake small enough to notice.

## Consequences

- A-126 never warns an unverified or unclaimed account: this rule will have removed it first. The
  collision between A-102 criterion 2 and A-126 criterion 1 disappears rather than being negotiated.
- `UNVERIFIED_ACCOUNT_DAYS` and `UNVERIFIED_EXPIRY_CAP` are new keys with no workshop mandate, so
  they go on the session 3 register as proposed values rather than being decided here (0019).
- A console-created account that is never claimed still lives indefinitely. That is A-116's to fix
  and is recorded in known issues rather than quietly left.
- Thirteen end-to-end suites registered an account and then signed into it. They now mark the
  address verified through `tests/helpers/accounts.ts`, except the ones whose subject is an
  unverified account.
