# 0242: A cancelled session answers no request, and every training email says what and when

- Status: Proposed
- Date: 2026-10-21
- Amends: G-104 criteria 3 and 4 (requests), G-106 (sign-up messages), G-113 criterion 2 (cancelling)

## Context

The hands-on map of 21 October 2026 found these problems with requests and training email.

- Opening a session marks every open request for its modules **Scheduled**. Cancelling that
  session left them Scheduled, so the member's ask was answered by a session that would never
  run. The cancellation email also promised "your place in the queue", and there is no queue.
- A decline was never emailed. The member saw the lead's words only if they went back to
  `/training`.
- Every training email printed ISO dates ("on 2026-10-28"). The cancellation and absentee
  subjects named no module, and the "is now scheduled" email gave no date and linked to
  `/training` rather than the schedule.
- The promotion email always said "Somebody has dropped out", even when places were raised. The
  demotion email blamed "the trainer" when the Theatre Manager had made the change.
- Nothing confirmed a sign-up, and a trainer the Theatre Manager named was never told.
- On the requests board, a lead with no trainer standing was offered **Schedule a session**,
  which went nowhere. The "shown first" line appeared when nothing was hidden, and a too-short
  decline gave no hint. The ask dialog did not say a module needs something first, and "What you
  could do next" listed committee-only modules a member cannot take.

## Decision

1. **Cancelling reopens what the session scheduled.** The "scheduled" claim key carries the
   request and the session (`training.request.scheduled:<request>:<session>`), so the notification
   ledger records which session scheduled which request, and a reopened request hears about the
   next one. A request is reopened when it is Scheduled and the cancelled session holds its claim.
   It stays as it is when another session still open for sign-up teaches the module, when the
   member has asked again since, or when the member now holds the module. The reopen runs in the
   cancel's batch behind its `session.cancelled` audit entry, so a cancel that lost a race reopens
   nothing. A claim pruned at the ledger's retention period leaves its request Scheduled, the safe
   way to be wrong. Matching by decision time instead was rejected in review: it reopened requests
   that a later session had scheduled and taught.
2. **A decline is emailed once** (`training.request.declined`), with the words as stored, so of
   two leads answering at once the member reads the one that landed.
3. **Training email dates go through `saysDayLong`**, and each subject or opening names the
   module. The scheduled email gives the day, time and place and links to the schedule.
4. **The promotion and demotion emails say what happened without naming who did it.**
5. **A sign-up is confirmed** (`training.session.signed-up`) with the member's standing, and a
   **named trainer is told** (`training.session.assigned`, transactional).
6. The board says whether the reader may schedule and whether it was cut short. The decline field
   says when a reply is too short. The ask dialog names any missing prerequisite. The next-steps
   list leaves out a module the member is barred from as committee-only.

## Consequences

- A request scheduled by a session that later ran and was then cancelled cannot happen: a session
  whose register has opened cannot be cancelled.
- Moving a session's places up and down still emails each move as it happens. Holding messages
  back to combine them would need a queue the training module does not have, and a delayed "you
  have lost your place" is worse than a second email.
