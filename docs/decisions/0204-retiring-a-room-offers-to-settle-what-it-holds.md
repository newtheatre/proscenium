# 0204: Retiring a room offers to settle what it holds

- Status: Proposed
- Date: 2026-10-21
- Amends: C-101 criterion 2 (a retired room keeps its history) for the Retire button on Rooms

## Context

Retiring a room took it off the calendar and touched nothing else. The rooms review (section 1)
retired a room holding one member's request and one officer's booking: the request stayed
"Waiting on a decision" with nothing said to the member, and approving it later failed with "That
room is no longer bookable", because the approving write refuses a retired room. The only ways
out were Turn down or a move, made one request at a time by somebody who knew to look. A booking
yet to start in the retired room also stood, so its member could turn up to a room we had stopped
offering.

## Decision

**The Retire dialogue counts what the room still holds and offers to settle it in the same step.**

- Before the verb is offered, the dialogue asks `GET /api/admin/rooms/[id]/held` for two counts:
  requests waiting on a decision and confirmed bookings, each starting from now. What has started
  or already happened is history and is never touched.
- Each count with something in it is a ticked box: "Turn down N waiting requests" and "Cancel N
  bookings yet to come". The officer may untick either. A link points at Room requests for a
  request better moved to another room, which is decided there before retiring.
- `DELETE /api/admin/rooms/[id]` takes `turnDown` and `cancel` in the query string, a DELETE
  carrying no body (0068). Each is asked only by `true`, so a caller that sends neither gets the
  old retire and nothing is cancelled without being asked for.
- The turn-downs, the cancellations, the retire and one `room.updated` audit row counting both
  run in one batch. Every statement is guarded on the room still being in use, so a second retire
  racing the first settles and audits nothing. Each is scoped by predicate on the room and the
  clock, never by a list of ids read first (0006). The count and the write share those predicates.
- A turned-down request reads as one the queue turned down: status `REJECTED`, decided by the
  officer, reason "{room} is no longer in use", and its member gets the `room.request.rejected`
  notification. A cancelled booking gets the reason in `rejection_reason` and its member the
  `room.blackout.cancelled` notification, which already says a room they booked was closed, gives
  the reason and attaches the calendar file that takes the event away (0132). Any series whose
  head went has its next occurrence promoted, as a closure does.

The **In use** switch on the edit form still retires without settling anything, and says so
beside the switch. It is the place a room is brought back, and an edit form is the wrong place
for a step that cancels other people's bookings.

## Consequences

- Retiring a room no longer leaves anyone waiting on a decision nobody can make, unless the
  officer chose that.
- The Retire verb waits for the count, so it cannot be pressed before the dialogue has said what
  retiring leaves behind. A count that fails says so and leaves the verb off.
- Untouched rows remain possible by choice: a request left waiting is still refused on approval,
  as before.
