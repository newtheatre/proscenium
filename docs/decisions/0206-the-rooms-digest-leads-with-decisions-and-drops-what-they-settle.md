# 0206: The rooms digest leads with decisions and drops what they settle

- Status: Proposed
- Date: 2026-10-21
- Amends: H-104 (digest coalescing) for the rooms topic

## Context

The process map of 21 October 2026 read three rooms digests: "15 Room booking updates", 13 and 21.
Each item was a whole email (greeting, body, sign-off) pasted under a bullet. Items came in the
order they were held, so a member was told "Asked for: Rehearsal Room 1 ... is with the Theatre
Manager" more than an hour after the "Approved" email for the same request, and requests since
moved or cancelled were listed with no sign that they were stale. The subject said nothing about
what needed attention.

`notification_digest_entries` holds `subject` and `body` only: no column says which booking an
entry is about, and adding one is a migration for a fix that does not need one.

## Decision

**A held entry's `body` is a small JSON document**: the message's full text (what any other
topic's digest still prints), one line for the rooms digest, the one link that line leads to, and
`about`, the ids of the bookings, series or Students' Union requests the message concerns. A body
that is not that JSON (an entry held before this change, or one erasure scrubbed to nothing) reads
as plain text whose line is its subject, so nothing already held is lost.

**A message type may `decide` what it is about.** Approved, turned down, lapsed, cancelled (one
or a series), closed, bumped, moved to or from the Students' Union, assigned, not being requested
and withdrawn all decide. When `notify()` is given such a message with `about` ids, before
anything else it deletes every unclaimed entry in that topic, for anybody, whose `about` shares an
id, except entries of the same type: a decision told to five approvers is one decision, and the
second must not delete the first one's entry. Already claimed entries are left alone. The ids
travel as one JSON parameter through `json_each`, so the statement's bound-parameter count never
depends on how many there are (0006).

The delete runs whether or not the decision itself reaches anybody, because the record is settled
either way. So the member's "Asked for" and every approver's "waiting" chase go the moment a
request is decided, and only the decision is told.

**The rooms digest is one line per change.** One greeting, a line per entry, one link (the lead
entry's: the queue for an approver, their bookings for a member) and one sign-off. Decisions come
first, then everything else, each oldest first. The subject is the lead entry's own subject,
followed by "and N more room booking updates" when there is more than one.

Other topics keep the nested form. `DIGEST_IN_LINES` in `shared/utils/notifications.ts` is the
switch per topic; turning it on for another topic is a change to that map and to its templates'
`line`, argued in a record of its own.

A template may return a `line`. A turned-down request's carries the officer's reason and a
closure's the closure's reason, since those are what the member needs from that item; every other
line is the subject.

## Consequences

- Nothing stale reaches a member about a request once it is decided, and the subject names the
  change that matters most.
- A decision held for a digest is never dropped by another decision of the same type, and a
  decision of a different type about the same record does drop it: a request moved to the
  Students' Union and then back is told once, as where it ended up.
- Entries carry their `about` ids for as long as they live; erasure still scrubs the body to an
  empty string (`shared/utils/personal-data.ts`), which reads back as plain text.
- The test that a digest coalesces (`tests/e2e/notification-digests.test.ts`) still holds plain
  text bodies, which is the fallback path; `tests/integration/notification-digests.test.ts` covers
  the JSON body, the supersession statement and the order.
