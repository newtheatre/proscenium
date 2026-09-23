# 0089: A message to ticket holders is a booking message, and reaches the address the booking was made with

- Status: Proposed
- Date: 2026-09-23

## Context

H-108 gave the announce composer four audiences, all of them members: current members, role
holders, tonight's rota and a session's sign-ups. Feedback issue 1213 asked for the audience of a
performance or a show, because a safety notice about a night concerns everyone coming to it, and
most of the people coming are not members. Cancelling a performance does not tell them either:
it cancels the rota and tells the people working it, and nothing else.

Two rules already in the catalogue stand in the way of reusing the composer's two message types
unchanged. `admin.announcement` carries the Committee announcements topic, which the preferences
screen describes as "announcements from the committee to the membership": the wrong switch for
a note about somebody's booking. And neither type reaches an unverified address (A-102
criterion 2), while every guest booker is exactly that: a guest account is made from the address
typed at checkout and is never verified unless its owner claims it. Sent under either existing
type, a safety notice would skip most of a house as unverified.

## Decision

A message to ticket holders is sent as one of two further types, chosen by the audience rather
than by the caller:

- `admin.ticket-holders` carries the **Bookings** topic ("changes to shows you have tickets for"),
  joins the bookings digest like any other topic-bearing message, and honours the recipient's
  bookings preference.
- `admin.ticket-holders.safety-notice` is transactional, as H-108 criterion 3 allows a safety
  notice to be.

Both come from the box office identity, both write an inbox entry beside the email (H-108
criterion 6), and both may reach an unverified address. That reach is the one the ticketing
types already have (`reservation.confirmed`, `reservation.cancelled`): the guest gave the address
so the theatre could tell them about this booking, and this is a message about this booking. It
is bounded by the audience, not by the officer: the type is only ever enqueued for somebody the
resolver found holding a live booking for the performance or show named.

The audience is resolved from live reservations at send time, scoped by subquery from the
performance or the show (0006): a booking held, collected or admitted at the door, with at least
one ticket not refunded, for a booker whose account is not anonymised (H-107). The resolver
returns distinct accounts, and an address belongs to one account, so a booker with three bookings
across a run is one recipient.

## Consequences

- A-102 criterion 2's list of what may reach an unverified address grows by two types. Both are
  bounded to a live booking, so neither can become a bulk send to the imported estate.
- A booking with no account behind it (an imported row with no booker) has no address and is not
  in the audience. The count the composer shows is the count of people it can reach.
- The Bookings topic now carries a message, so `digest.bookings` has something to carry and the
  bookings preference switch does something.
- The member announcement types are unchanged: a member audience still reads as a committee
  announcement, and still does not reach an unverified address.

## Options considered

- **Reuse `admin.announcement` and `admin.safety-notice`, adding unverified reach to both.** Lost
  because it would let a member audience reach unverified imported accounts, which is precisely
  the bulk send A-102 criterion 2 exists to prevent.
- **Send ticket holders the safety notice only.** Lost because not every message to a house is
  urgent (a changed start time, a note about parking), and a transactional type for those would
  take away the one preference a booker has.
