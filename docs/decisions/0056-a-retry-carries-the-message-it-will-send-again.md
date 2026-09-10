# 0056: A retry carries the message it will send again, and gives up visibly

- Status: Accepted
- Date: 2026-09-10

## Context

H-105 asks for failed sends to retry automatically with backoff and a configurable maximum number
of attempts, for each attempt to be appended to the same log entry rather than to a new one, and
for an exhausted entry to be marked failed for good and surfaced for somebody to act on.

`notify()` renders a message from a context the caller passes in and hands the result to the
transport. Nothing about that context is persisted, so a scheduled sweep coming along ten minutes
after a failure has the recipient and the type but not the message: there is no way to send again
what was sent. The three things a retry could work from are all imperfect:

- **The context**, stored as JSON. It is small, and re-rendering picks up a name changed in
  between. It also does not survive the round trip: several templates take a `Date`
  (`expiresAt`), and `JSON.parse` gives back a string, so a retried message would quietly render
  an invalid date rather than fail. Template payload validation is H-109's, and does not exist yet.
- **The rendered message.** Exactly what the first attempt tried, so a retry is a retry rather than
  a re-render. It is bigger, and it is the message body, which is personal data sitting in an
  operational log.
- **Nothing, and re-derive from the source record.** There is no general way back from a log row to
  the booking, shift or session that caused it, and building one per type is thirty-two pieces of
  bespoke work.

Attachments are a separate problem under all three. They are built by the caller (an ICS file for a
room booking, a reminder or a shift; a ticket later), never by the template, and they are not in the
log under any option.

## Decision

**A retry re-sends the rendered message, carried on the log row in `retry_payload` as
`{ subject, html, text }`.** No re-render, so no revived-`Date` class of bug, and what arrives on
the third attempt is what was written on the first.

**The payload is held only while a retry is owed.** `notify()` writes it when a send fails and a
retry is still possible; every terminal outcome clears it, including the retry that finally
succeeds and the one that runs out of attempts. A row at rest therefore carries no message body,
and the personal-data window is the retry window rather than the retention period. `retry_payload`
is in `personal-data.ts`'s scrub list, and it is in no customer or operator response: H-106
criterion 3 says an operator answering a support query sees types, dates and outcomes, never
bodies.

**The attempt counter is on the row and the due time is not.** `attempts` counts provider
attempts, the first one included, so a refusal that never reached a provider (a preference, an
unverified address, an anonymised account) spends nothing. The next attempt is due at
`created_at + backoff * (2^attempts - 1)`, computed in the predicate rather than stored, which is
the same doubling `retryDueAt()` states in `shared/utils/notifications.ts`. A stored due time is
one more thing that can disagree with the count beside it.

**A message carrying an attachment is not retried.** It goes straight to `FAILED_FINAL` with the
reason on the row, because a ticket sent without its ticket is worse than a visible failure, and
the attachment is not in the log to send again. H-106's manual re-send goes back through the route
that built the attachment in the first place, which is the only place that can rebuild it.

**A send with no account is a first-class send, and is retried the same way.** `notifyAddress()`
takes a literal recipient, logs a row with `user_id` null, and on failure stores the address inside
the same payload as the rendered message, because no account will resolve one at the next attempt.
The retry judges such a row on its address alone: the deliverability rules still apply (H-107), and
the account, verification and preference guards are skipped because there is nobody to ask. It
still needs a registered type, since an account-less send is not an untyped one (H-101 criterion 2).
This exists because E-124's night report goes to `NIGHT_REPORT_RECIPIENTS`, configured addresses
rather than accounts, and without it that story's sends could never be retried at all.

**A suppression is terminal and never enters the retry machinery.** A muted topic is not a message
that failed to arrive: there is nothing to send again, retrying it would send exactly what the
member switched off, and it would double the per-type counts 0048 exists to keep honest. The sweep
selects `FAILED` alone, the claim is conditional on that status, and a preference switched off
between two attempts settles the entry as `SUPPRESSED_PREFERENCE` with its payload cleared.

**The sweep claims a row before working on it.** `UPDATE ... SET status = 'RETRYING' WHERE id = ?
AND status = 'FAILED'` returning a row is the claim, so two overlapping runs cannot both send the
same message (0003, 0049). `RETRYING`, which has sat unused in the status check since the table was
created, is what that claim means.

**Every guard runs again on a retry.** The account is re-read, so an address changed since the
first attempt reaches the new one and an account anonymised in the meantime is dropped as
`SKIPPED_UNDELIVERABLE` (H-107 criterion 4, which this is the first thing to satisfy). The
preference is re-read, so a topic switched off between attempts suppresses the retry (H-102
criterion 4: a change takes effect for the next send, and a retry is a next send).

## Consequences

- The migration widens `notification_log`'s status check to add `FAILED_FINAL` and adds `attempts`
  and `retry_payload` in the same rebuild. It is the second rebuild of this table in two pull
  requests, deliberately: shipping `FAILED_FINAL` in H-102's rebuild would have been a status
  nothing wrote and no test exercised. No trigger sits on the table and no foreign key points at
  it, which is what makes a rebuild of it ordinary (0010, 0052, 0058).
- `notifications:retry` joins the existing ten-minute cron rather than taking a cadence of its own,
  so the backoff's first step is ten minutes and five attempts span about two and a half hours.
- The prune runs inside `daily:sweeps` and is capped, so the first run after a long gap drains over
  several nights rather than deleting everything at once.
- A caller that wants a failure retried must not pass an attachment. Three do today: the room
  booking confirmation, the room reminder and the shift reminder, all ICS.
- H-105 criterion 1 also asks for the template version on the row. Templates are not versioned
  until H-109, so there is nothing true to record; a known-issues row says so rather than a column
  holding nulls.
- The topic is not stored on the row. It is a property of the type in the catalogue, and storing it
  would let a row disagree with the code; H-106 filters by topic through the catalogue.

## Options considered

- **Store the render context and re-render.** Rejected above: a `Date` does not survive JSON, and
  the failure mode is a wrong time in a message rather than an error.
- **Keep the payload for the life of the row.** Rejected. It would put every failed message's body
  in the log for the whole retention period to save clearing one column.
- **Retry in the request, with sleeps.** Rejected. A Worker's request lifetime bounds the backoff
  to seconds, so the outage a retry exists to survive is exactly the one it would not.
- **Store a due timestamp per row.** Rejected. Two fields that must agree, where one function over
  the other field says the same thing.
- **Retry attachment-carrying messages without their attachment.** Rejected. A ticket email with
  no ticket looks delivered and is not.
