# 0123: A walk-up is filed under an address only when the name agrees or the booker says so

- Status: Proposed
- Date: 2026-10-14
- Amends: D-115 criteria 6 and 7 (the desk's walk-up form)

## Context

A walk-up sold at the desk or the till with an email address is filed under whichever account
owns that address (`guestAccount()`), the same rule D-104's guest checkout uses online. Online the
booker types their own address; at the counter an officer types it from what they hear. The
hands-on test of 13 October 2026 typed a member's address for a stranger's walk-up: the paid
booking landed on the member's `/my` and its confirmation went to the member, while the name the
officer typed was discarded. A second sale was refused for capacity after it had already created
an account under the typed name, so every later sale on that address read back the first name.

The desk's form also still asked for a name and an email, which D-115 criterion 6 made optional
on 14 September and the till already treats as optional.

## Decision

- **The name and the email are optional at the desk, and go together.** With neither, the booking
  has no account and is found by reference, as the till's is. With one and not the other, the
  screen asks for the missing one before anything is sold.
- **An address already held in another name is refused, not filed under silently.** Before a
  desk sale or a till charge, `walkUpBookerRefusal()` compares the typed name with the account's,
  ignoring case and spacing. A mismatch is a 409 that says the address belongs to an account in
  another name, tells the officer to check the address with the booker, and that nothing has been
  charged. It names nobody, so it reveals nothing the officer did not type.
- **The booker's say-so lets it through.** The form then offers "It is their account"; ticked, the
  same request carries `existingAccount: true` and the booking is filed under that account. The
  account keeps its own name: a walk-up never renames anybody.
- **The till asks before the reader does.** The question is asked when a card charge starts
  (`POST /api/till/payments`) and on the readerless sale route, never when an answered charge is
  committed, so money is never taken for a sale this would then refuse.
- **A sale the house cannot hold creates nobody.** The desk route refuses an order larger than the
  seats left, quoting them, before any account is made. The capacity predicate on the write still
  decides a race, as D-105 requires.
- **The desk sends the paid confirmation** (`reservation.walk-up-paid`, the till's template) when
  the walk-up has an address, as D-115 criterion 6 always intended.

## Consequences

- A member whose name is spelt differently at the counter ("Matt" for "Matthew") costs the officer
  one tick. That is the price of never putting a stranger's booking on a member's account.
- An address with an account but no usable name (a nameless row) always asks.
- Online guest checkout is unchanged: the booker types their own address there, and D-104's
  enumeration-safety rule forbids telling a visitor that an address has an account.

## Options considered

- **Keep the typed name on the booking.** A `booker_name` column would show the right name at the
  desk, but the booking would still sit on the member's account and email them. It fixes the
  symptom, not the privacy failure.
- **Look the address up as it is typed.** A lookup route would tell staff whose account an address
  is before they sell, but it is an enumeration channel open to every bar shift.
