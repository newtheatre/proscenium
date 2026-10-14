# 0132: A booking that ends takes its calendar event with it, and the message carrying it sends at once

- Status: Proposed
- Date: 2026-10-14

## Context

C-104 criterion 1 attaches a calendar file to a booking's confirmation, so the booking reaches a
member's own calendar without a subscription. Criterion 5 then promises that a cancelled or bumped
booking disappears, but only from the subscription feed: a member who opened the confirmation's
file has a copy the feed never touches. The hands-on review of 13 October 2026 found exactly that.
A cancelled booking stayed in the member's calendar, and approvals, turn-downs, closures and
self-cancellations appeared to send no email, because every one of them is a rooms-topic message
with no attachment and so joins the hour-long digest (H-104, 0061) while only the confirmation,
which carries a file, went at once.

Two gaps sat behind the same symptom. An approved request is the booking's confirmation, yet
carried no file, and neither did a series confirmed at once. And nothing that ends a booking sent
anything a calendar client could act on.

## Decision

**Every message that ends a booking a member may hold in their own calendar carries a calendar
file that cancels it**: the member's own cancellation (one booking or a series), a closure that
cancels it, and a bump. The file names the same event (`UID:booking-<id>@<host>`) with
`METHOD:CANCEL`, `STATUS:CANCELLED` and a `SEQUENCE` stamped at the moment of sending, which
outranks every file sent before; `METHOD:CANCEL` is what makes a client remove an event it imported
(RFC 5546), where a `PUBLISH` marked cancelled is struck through by some clients and ignored by
others. A request for a Students' Union room never had a file, so a series cancel sends one only
for its weeks in our own rooms.

**Every message that confirms a booking carries the booking's own file**: an approval (one file
for every request of that member's decided in the batch, moved rooms included) and a series
confirmed at once (one event per week), as a single booking's confirmation already did. A bump
carries both: the cancellation for what was taken, and the booking held for them in its place.

**Carrying a file means sending at once.** That is 0061's existing rule (an attachment has nowhere
to wait in a digest entry), not a new one, and it is the right outcome here: a confirmation or a
cancellation is a change to somebody's diary, which an hour's delay makes wrong. Turn-downs,
expiries and request receipts carry no file, because nothing of theirs was ever in a calendar, and
they keep coalescing exactly as H-104 asks.

## Consequences

- A member who cancels sees the email straight away, and opening its file takes the event out of
  their calendar. A booking sent while the provider is down is failed for good rather than retried,
  as every message with an attachment already is (0056), and is resent from source by H-106.
- Approvals and cancellations no longer coalesce: five decided in one batch for one member are
  still one email (C-109 criterion 4), but two batches in an hour are two. The digest keeps the
  messages that change nothing in a calendar.
- The send log now shows `room.request.approved`, `room.booking.cancelled`,
  `room.series.cancelled`, `room.blackout.cancelled` and `room.booking.bumped` rows at the moment
  of the action; `room.request.rejected` still appears only when the rooms digest sends.
- A file that cancels an event the client never imported is harmless: clients ignore a `CANCEL`
  for an unknown `UID`.
