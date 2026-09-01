# 0036: An externally arranged room is a request, not a booking

- Status: Accepted
- Date: 2026-09-01

## Context

The Students' Union manages hundreds of rooms across the university. We ask for one by filling in
their form, on which we may state a preference, and **they decide which room we get**. They may
give us anything.

Until now an SU room was an ordinary row in `rooms` with `is_external = 1`. That made it a bookable
room: it appeared on the week grid as a permanently empty column with clickable free slots, it held
slots in the clash predicate, and a booking for one was diverted to the approval queue. Four things
were wrong with that:

- **It promised availability we do not control.** A member could click a free slot in a room the
  union might not give us.
- **Two members could not both ask for the same evening**, because the second was refused by the
  clash predicate. The union has hundreds of rooms; both asks are perfectly possible.
- **There was nowhere to record what we asked for against what we got.** Approving jumped straight
  to `CONFIRMED` at the moment the Theatre Manager *intended* to book it, not when the union agreed.
- **What we had learned about a room lived in a spreadsheet.** We have been given a meeting room
  with a fixed table to rehearse in, and found out by turning up to it.

This answers open question 3 in `docs/backlog/C-spaces.md`, open since Phase 0.

## Decision

**An external request is its own thing, in its own tables, with its own lifecycle.** It is not a
`room_bookings` row with a new status.

`external_spaces` is a searchable reference catalogue of union rooms; `external_space_notes` records
one verdict per room per purpose; `external_requests` carries the ask; `external_assignments`
records every room the union offered and whether it suited.

## Why not one table with an `AWAITING_EXTERNAL` status

The clash predicate is the obvious argument and it is the weaker one: six of the nine slot-holding
reads share the `HOLDS_A_SLOT` constant, so exempting them would be one edit.

The decisive reason is that **`room_bookings.room_id` is `NOT NULL` and every member-facing read of
it is an `innerJoin` on `rooms`** (`bookingFor`, the member's own list, `selectPending`,
`displacedBooking`, the ICS feed, `sweepRequests`). An external request **has no room until the
union answers**. Under one table there were two options and both were worse:

- **Make `room_id` nullable.** That is a rebuild of a 22-column table, and then every one of those
  `innerJoin`s silently *drops the row*: an in-flight request would vanish from the member's page,
  from their calendar feed and from the queue, with no error anywhere. A forgotten predicate at
  least produces a visibly wrong answer; this produces silence.
- **Keep a placeholder "an SU room" row.** Then every request collides with every other one in
  `claimSlot`'s `NOT EXISTS`, and fixing that means joining `rooms` inside the contended hot-path
  INSERT.

Two supporting reasons. The lifecycle has three decision points where a room request has one, and
`decide.post.ts` has two verbs precisely because a room request has one decision. And **half of
module C is inapplicable** to a room we do not control: no-shows, bumping, series, blackouts,
opening hours, capacity warnings and utilisation denominators are all meaningless for it. Two tables
make that true by construction rather than by a conditional somebody has to remember.

## Consequences

- **C-103 criterion 2 is superseded.** It says "CONFIRMED bookings, PENDING requests with a room
  assigned, and AWAITING_EXTERNAL bookings all hold their slot". The last clause is now false: an
  external request holds nothing anywhere. The criterion is amended in the backlog.
- **`AWAITING_EXTERNAL` returns with exactly its old meaning**: the form is in and the union has not
  answered. C-118's importer stops translating it away, which meets its criterion 1 for the first
  time. The venue an imported row names is its *preference* where the union had not answered and
  its *assignment* where it had.
- **`rooms.is_external` goes.** Existing external rooms are copied into `external_spaces` reusing
  their id and deactivated in `rooms`, so historic bookings still resolve. `judge()` loses its
  `isExternal` branch and now diverts for two reasons rather than three.
- **Confirm is folded into assign.** An accepted assignment *is* the confirmation; a separate click
  would add no information and one more thing to forget.
- **An external request escalates but never expires.** Expiry exists to free a held slot and this
  holds none; a lapsed request would tell the member nothing while the union may still answer. The
  asymmetry with `rooms:sweep` is deliberate.
- **Assignments and notes are ordinary rows, not an 0010 append-only register.** Assignments look
  like a ledger, but invoking 0010 would drag in trigger enforcement for no gain, and a note says
  what we believe about a room *today*: a room that has its table taken out should stop being marked
  bad. Do not "fix" this later.
- **`status` carries a CHECK; `purpose` does not.** A status is a closed set about process. A
  purpose is a committee-editable list, so a constraint behind it breaks writes the moment they add
  to it (0033's family).
- **The suitability check is a refusal, not a warning.** Assigning a room we have marked unsuitable
  for that purpose returns 409 unless the caller asserts past it. The whole complaint is that nobody
  knew until they turned up, and a warning at that point would be read past.
- **A union request does not count against the room booking cap.** The cap protects rooms we
  control; the union's rooms are not ours.
- **No-shows cannot be recorded against a union room**, because `room_no_shows.booking_id`
  references `room_bookings` and making it polymorphic would be worse than the gap. Recorded in
  known issues.

## Alternatives rejected

**List every union room as a bookable room.** Hundreds of rooms in the estate, a calendar full of
columns nobody may book, and the availability lie unfixed.

**Keep one placeholder external room and a nullable preference.** Every request collides with every
other, which is the bug this exists to remove.

**A polymorphic booking table.** `room_id` or `space_id`, one of them null, enforced by comment: the
old app did exactly this and the invariant was never enforced anywhere.
