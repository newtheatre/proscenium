# 0061: A held message writes no send-log row of its own; the digest that covers it does

- Status: Accepted
- Date: 2026-09-10

## Context

H-104 asks for non-transactional messages of the same topic to the same person, inside a
configurable window, to coalesce into one email listing every change individually, while the
in-app inbox keeps showing each change the moment it happens (criteria 1, 4). H-105 already
answers "was a message sent" from `notification_log`, one row per send, and 0048 made that literal:
a claimed send is one row, updated to its outcome, never a second insert.

A coalesced send does not fit that shape unchanged. Five things happen (five room-booking status
changes) and one email goes out an hour later. If each of the five still wrote its own
`notification_log` row, "how many bookings emails went out today" would need to know to collapse
rows that share a digest, the same `toBeGreaterThan` problem 0048 removed, back by a different
door. Criterion 5 asks the opposite: one row for the send, referencing its constituent entries.

## Decision

**An unclaimed, topic-bearing message that would otherwise be emailed now is held instead: a row
in a new `notification_digest_entries` table, and `notify()` returns `HELD_FOR_DIGEST` without
writing to `notification_log` at all.** The inbox entry, if the type declares one, is written
first and unconditionally exactly as it is today; only the email is held, so criterion 4 costs
this decision nothing further. `notification_digest_entries` carries the rendered subject and body
(what the inbox row already carries, kept a second time here because the email is not the inbox:
a subject switched off for email but not the inbox still needs the inbox's own write, and holding
reuses the same rendered text rather than re-rendering later).

**The test for whether a type may ever coalesce is not how important it reads, it is whether it
carries a deadline a digest interval would eat.** `topic: null` already marks that shape for other
reasons (H-103): a hold expiring, an offer waiting to be claimed before it lapses to the next
entry, a booking confirmation the guest is holding open in another tab. Delaying any of those into
a digest spends the window the feature depends on, so transactional never coalesces, whatever else
is true of the send; this is `joinsDigest()`'s first condition, not a special case bolted on. D-113
confirmed the shape from the other side: its waiting-list offer is transactional for exactly this
reason, checked against this decision rather than decided independently of it.

**Two kinds of message bypass the hold and send as they do today.** A claimed call already batches
itself before it reaches `notify()` (0048's own words: "several rows... before a single
digest-style message covers all of them"), so holding it again would be a second, uncoordinated
batching layered on the first. A message carrying an attachment has nowhere to put it: the entry
stores rendered text, not files, and an attachment is the caller's, not the template's, the same
fact that already keeps an attachment out of a retry (0056). Both keep exactly the send-now
behaviour this repository already has; H-104 changes nothing about when `room.booking.confirmed`
or `shift.reminder` arrive.

**`notifications:digest` claims a topic-and-person pair the same way `notifications:retry` claims
a row: a conditional `UPDATE` on the predicate, never a read followed by a write (0003).**
`digest_log_id IS NULL` is the claim; the sweep sets every unclaimed row for one topic and person
to the same id in one statement, so a second overlapping run finds nothing left. The window opens
at the earliest unclaimed entry, not the latest, so a member is never told sooner than the first
change earned; an entry arriving after a claim starts its own window rather than riding along on
a digest that already went (criterion 6).

**The digest itself sends through `notify()` again, under a message type of its own per topic
(`digest.bookings`, `digest.shifts`, `digest.training`, `digest.rooms`, `digest.announcements`),
carrying the id the sweep already claimed entries under.** `notify()` gained an optional `id` on
`Notification` for exactly this: the sweep needs the row it inserts to be the same id the entries
already reference, and generating that id before the claim, rather than after the send, is what
lets the claim and the reference agree without a second round trip. Every digest type is
transactional (`topic: null`) and email-only. Transactional is what keeps a digest from holding
itself for the next digest, which would never send; email-only is what stops it writing a second
inbox entry for changes the inbox already has.

**No preference re-check at the digest's own send, only at each entry's hold.** H-102 criterion 4
says a preference change takes effect for the next send and "no queued digest already cut is
recalled." Each entry was individually approved when it was held (the account, verification and
preference guards all ran, exactly as an immediate send's would); the digest that later carries it
is not re-asking that question, only compiling what was already agreed to. `notify()`'s own account
and deliverability guards do run again at the digest's send, because H-101 criterion 5 reads the
current address at send time regardless of when the underlying change happened; H-107's protections
are unconditional and are not this decision's to relax.

**An entry's retention rides on its digest's send, but not through a foreign key.** A first attempt
gave `digest_log_id` a cascading reference to `notification_log`, and `check:migrations` refused
it: that table is rebuilt on every status it gains (three times already), and a cascading dependent
on a table already rebuilt is exactly what 0052's check exists to catch, because the rebuild does
not know to save and restore what a drop would take from a dependent nothing named to it explicitly.
`daily:sweeps` prunes an entry whose `digest_log_id` names a row that is gone instead, by
`NOT EXISTS`, scoped by subquery and capped like every other sweep (0003, 0006). An entry still
held (`digest_log_id` null) has nothing to be missing yet and is untouched by that prune, which is
what "was I told about X" needs to keep answering while a change waits for its window to close.

## Consequences

- The migration adds one table and no change to `notification_log`'s own shape; H-104 needed no
  rebuild of that table, unlike H-102 and H-105 before it.
- `training.expiry.digest` and the other caller-side digests (role expiry, retention) are
  themselves topic-bearing, unclaimed sends. This decision does not exempt them: if one lands
  inside the same window as an unrelated message of the same topic, the two coalesce into one
  email. That is accepted rather than special-cased, because the outcome (fewer emails, every
  change still listed) is what H-104 asks for; a caller wanting to guarantee its own message is
  never merged would need to claim it, which none of today's digest senders do because they have
  no natural idempotency key to claim against.
- `check:notifications` is unaffected: the sweep sends through `notify()`, never the transport
  directly, so the one-sender rule (0013) holds without a new exemption.
- H-106's operations view reads `notification_log` as it already does; a held entry is invisible
  to it until its digest sends, which is deliberate; a dashboard wanting to show what is currently
  held would read `notification_digest_entries` directly, not this decision's to build.

## Options considered

- **Log every held message immediately, as its own row, and mark a digest's rows with a shared
  reference afterwards.** Rejected. It is the two-row shape 0048 undid, with a second column
  instead of a second table: "how many sent" has to know to collapse references again.
- **Keep the digest's constituent text inside `notification_log.retry_payload`, reusing H-105's
  column rather than a new table.** Rejected. `retry_payload` is cleared by every terminal outcome
  (0056); a digest's entries need to persist as long as the log row itself does, which is a
  different lifetime carried by a column named for a different purpose.
- **One config key holding a per-topic record (`{ BOOKINGS: 60, SHIFTS: 60, ... }`).** Rejected by
  `config.test.ts` before it was rejected by choice: 0025 already settled that a setting is a rule,
  a scalar or a list of them, and a keyed record is a table in a blob. Five scalar keys,
  `NOTIFICATION_DIGEST_WINDOW_<TOPIC>_MINUTES`, are what the topic list actually needs and what
  the enforced-keys check (a literal `configValue()` call per key) can still verify are read.
- **Re-check the topic preference at the digest's send, not only at each entry's hold.** Rejected:
  H-102 criterion 4 says explicitly that a queued digest already cut is not recalled, and an entry
  already passed that check once; asking twice answers nothing a member did not already decide.
