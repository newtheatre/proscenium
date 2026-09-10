# 0054: A suppressed message is its own outcome, and still reaches the inbox

- Status: Accepted
- Date: 2026-09-09

## Context

H-102 asks for per-topic preferences a member controls, and for two things about what happens when
one is switched off: the send log records the message as suppressed by preference (criterion 3),
and the in-app inbox entry is written anyway, so switching email off never makes a message
unfindable (criterion 6).

Neither held. `notification_preferences` and `deliversOn()` existed from H-101 and were honoured
at send time, but nothing outside test SQL ever wrote a preference row, and a suppressed send was
recorded as `SKIPPED_UNDELIVERABLE` with `error = 'preference'`: the same status the log uses for
an address that was never real. The two are different facts. One is the member's own choice
working as intended; the other is a defect in the data or an account that has gone. A dashboard
that cannot tell them apart (H-106) reports a working preference as a delivery problem, and an
operator who learns to ignore the row learns to ignore both.

`inbox_items` existed too, with no writer at all. Only two message types declared the `INBOX`
channel (the health alert and the retention digest), and both are transactional, so no message a
preference could silence reached the inbox. Criterion 6 was therefore not merely unbuilt, it was
unreachable: there was nowhere for a suppressed message to be found.

The defaults were a third gap. `notification_preferences` defaults `email` to true and `push` to
false at the column, and `deliversOn()` read an absent row as yes. That is a defensible rule but it
is a rule in two places and configurable in neither, and criterion 2 asks for defaults agreed in
Phase 0 configuration and shown on the screen as defaults.

## Decision

**Suppression by preference is its own send-log status.** `notification_log.status` gains
`SUPPRESSED_PREFERENCE`, and `notify()` writes it with `error` left null: the status is the
reason, and a second copy of it in `error` is a fact stored twice. `SKIPPED_UNDELIVERABLE` keeps
its meaning, which is an address the provider must never see (H-107). Both remain non-terminal
for nobody: a claimed row is updated in place to either, exactly as 0048 says.

**The inbox is the backstop for anything a preference can silence, so a topic-carrying type must
declare it.** Every message type with a topic now lists `INBOX` alongside `EMAIL`, and a unit test
fails the build when a new one does not. Rather than deriving the channel from the topic, the
declaration stays in the catalogue where a reviewer reads it, and the test is what keeps the two
in step. `notify()` writes the inbox entry before it judges the email, so a suppressed, unverified
or bounced message is still findable; an anonymised account is the one exception and receives
nothing at all.

**An inbox entry is a row in `inbox_items` and not a second row in `notification_log`.** The
channel model has three channels and the log has a channel column, so logging the in-app delivery
as well would be consistent, and it was rejected anyway: `inbox_items` already carries what was
written, to whom and when, and the second row would double every per-type count in the log. Two
streams have already had to write `toBeGreaterThan` where they wanted an exact count (0048), and
this would have reintroduced that for thirty-two message types. H-106's dashboard reads
`inbox_items` for the in-app channel.

**Preference defaults are configuration, one list of topics per channel.**
`NOTIFICATION_EMAIL_DEFAULT_TOPICS` ships as all five topics and
`NOTIFICATION_PUSH_DEFAULT_TOPICS` ships empty, because push has no deliverer and consent is
collected when it does (H-101 criterion 6, H-204). `deliversOn()` takes the defaults as an
argument, so an absent row means the configured default rather than an assumed yes, and a workshop
changing what a new account hears about is a settings change and not a release (0012, 0019).

**A row is written only when the member chooses.** A new account has no preference rows at all,
which is what lets a default changed later still reach it. The screen therefore shows the default
value of every cell and says which cells are defaults, rather than seeding rows on registration
and pretending they were chosen.

## Consequences

- The status change is a widening of one CHECK on `notification_log`, which drizzle-kit generates
  as a table rebuild. That table carries no trigger, no foreign key points at it, and 0058 already
  rebuilt it once for `PENDING`, so this is the same shape reviewed once before rather than a new
  risk (0010, 0052).
- `RETRYING` was already in the check and is still unused: retries are H-105's, and a `FAILED_FINAL`
  outcome will need the check widened once more. Doing both in one rebuild was considered and
  rejected: a status nothing writes is a status nothing tests.
- Every one of the thirty-two topic-carrying types now writes an inbox row on every send. A member
  with email on receives both, which is what the channel model says should happen.
- A future type that carries a topic and forgets `INBOX` fails the build on another stream's
  branch. That is the guard working, and the failure names the criterion.
- H-101 criterion 3's `undelivered-channel` outcome remains unbuilt: nothing routes to push, so
  there is still no send to record. It is not made worse by this record, and H-105 is where the
  outcome vocabulary is completed.
- H-104's digest coalescing keeps the individual inbox entries and coalesces only the email, which
  this shape already supports: the inbox write is per message and the log row is per send.

## Options considered

- **Keep `SKIPPED_UNDELIVERABLE` and read `error` to tell the cases apart.** Rejected. It is the
  state we are in, it puts a member's working preference in the same bucket as a broken address,
  and every reader has to know the convention rather than the schema.
- **Derive the inbox from the topic instead of declaring it.** Rejected. `channels` would stop
  describing where a type actually goes, and the one place that knows would be a branch inside
  `deliversOn()` rather than the catalogue entry a reviewer reads.
- **Two booleans for the defaults rather than two lists of topics.** Rejected. It cannot express
  "announcements on, everything else off", which is exactly the kind of decision a workshop makes.
- **Seed five preference rows when an account is created.** Rejected. It freezes the defaults at
  registration, so a workshop changing one would reach nobody who had already signed up, and it
  makes every cell look like a choice the member made.
