# 0205: A new room request reaches approvers at once

- Status: Proposed
- Date: 2026-10-21
- Amends: H-104 (digest coalescing) for the two approver alerts named below

## Context

H-104 holds every unclaimed message that carries a topic and no attachment for its topic's
digest, which goes out once `NOTIFICATION_DIGEST_WINDOW_ROOMS_MINUTES` (60 by default) have passed
since the person's first held message, on the next ten-minute tick. Every rooms message carries the
**Room bookings** topic, so "A room has been asked for" (`room.request.raised`) and "A Students'
Union room has been asked for" (`external.request.raised`) waited in that digest too.

The operator page for the queue says approvers are emailed the moment a request arrives, and the
process map of 21 October 2026 found that untrue: a request for tomorrow morning could sit unread
for an hour and ten minutes before anybody who can answer it heard of it. A held slot nobody
answers in time is a room nobody uses.

## Decision

**A message type may be `immediate`: it is never held for a digest, though its topic preference
still applies.** `joinsDigest()` refuses an immediate type, so `notify()` sends it on its own.
An approver who has switched room bookings email off is still not emailed; the in-app entry and
the queue's sidebar count still tell them, as they did.

Which rooms messages go straight out, and why:

- **Anything carrying a calendar file**: a booking confirmed, a request approved, a booking or a
  series cancelled, a closure, a bump, the day-before reminder. A file cannot be reattached later
  (H-104, 0056), so these already bypassed the digest and still do.
- **A new request, to every approver** (`room.request.raised`, `external.request.raised`). Somebody
  has to act on it, and the time it waits is time taken from the member's notice. These are now
  `immediate`.

Which wait for the digest, and why:

- **The member's own news that asks nothing of them yet**: "Asked for" (single, series, a
  Students' Union room), a turned-down request, a lapsed request, the Students' Union steps (form
  in, room assigned, asking again, not being requested, moved between us and the SU), and a
  no-show notice. The member has already seen the outcome on screen or in the app, and an hour's
  wait costs nothing that the digest's single email does not repay.
- **Chases to approvers** (`room.request.waiting`, `external.request.waiting`) and a withdrawal
  (`external.request.withdrawn`). They are sent by the morning sweep or follow an alert that has
  already gone at once, so they are a reminder rather than the first news.

`immediate` is a property of the type, set in `shared/utils/notifications.ts`, so a new type
chooses it once and no call site re-derives it.

## Consequences

- An approver gets one email per new request at the moment it arrives, rather than one digest an
  hour later. On a busy evening that is more email; the preference is still theirs to turn off.
- The requester who is also an approver (the Theatre Manager asking for a room) gets their own
  alert at once as well. That is unchanged in kind from before.
- The operator pages (`content/docs/06.spaces/2.room-requests.md`, `content/docs/12.communications/
  3.what-the-theatre-sends.md`) now say what the code does.
