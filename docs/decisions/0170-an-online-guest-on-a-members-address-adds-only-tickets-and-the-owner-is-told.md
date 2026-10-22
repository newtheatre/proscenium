# 0170: An online guest on a member's address adds only tickets, and the owner is told

- Status: Proposed
- Date: 2026-10-22
- Amends: D-104 criteria 1 and 6 (guest checkout resolves to an existing account); complements 0123

## Context

Online, a guest who types an address that already has an account gets the booking filed under
that account (`guestAccount()`), the rule D-104 set so that checkout never reveals whether an
address is registered. The process map of 21 October 2026 typed a member's address under a
stranger's name: the unpaid hold landed on the member's account, the typed name was dropped, and
the confirmation greeted the member by their own name with nothing to say the booking was not
theirs. The desk refuses the same thing unless the booker says the account is theirs (0123), but
the desk can ask a question a public form cannot without opening an enumeration channel.

## Decision

- **Only the tickets join the account.** The booking is filed under the account as before. The
  account keeps its own name and every other detail; nothing the guest typed is written to it.
- **The owner is told, the visitor is not.** When the typed name differs from the account's
  (`bookedInAnotherName()`, the same comparison as 0123's `sameBookerName()`), the confirmation
  carries one more line: the booking was made online with their address in the typed name, and if
  that was not them, to open the booking and cancel it, with nothing paid. A nameless account counts
  as a different name.
- **The visitor's answer is unchanged.** The response, the booking page and every refusal read the
  same whether or not the address had an account, as D-104 requires.

Matt Adcock chose this on 22 October 2026: "Nothing but the tickets will be associated to the
member's account".

## Consequences

- An owner who did make the booking under a nickname reads one extra sentence they can ignore.
- A stranger can still hold seats on a member's account until the owner cancels or the hold
  releases; nothing is paid, and the owner now knows.

## Options considered

- **Send the guest to sign in.** Clearest, but a refusal only for registered addresses tells anyone
  which addresses are registered, which D-104 forbids.
- **Detach the booking from the account.** Held with no account and emailed to the typed address:
  enumeration-safe, but it needs new columns that touch erasure, desk search and resend.
