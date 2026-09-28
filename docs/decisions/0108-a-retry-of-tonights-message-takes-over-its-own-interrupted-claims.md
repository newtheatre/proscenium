# 0108: A retry of tonight's message takes over its own interrupted claims

- Status: Accepted (IT Manager, 28 September 2026)
- Date: 2026-09-28
- Amends: 0048 ("a stuck `PENDING` row is left visible, not hidden"), for "Message tonight's
  audience" (0101) only

## Context

"Message tonight's audience" (0101) claims each copy under the draft before it sends:
`sendNightMessage()` (`server/utils/night-message.ts`) calls `claimNotification()` and then
`notify()`, so pressing Send again after a dropped connection reaches only those not yet reached.
If the Worker dies between the claim and the send, the claim stays `PENDING`, and 0048 leaves a
stuck `PENDING` row alone. Every later press of the same draft then finds the claim held and
skips that person for ever. The screen's help (#1495) could only tell the duty manager to tell
such a person directly, on a night when they cannot know who it was.

The claim key named the draft and the recipient but not the sender, so nothing on the row said
whose send it was. A takeover must never reach into another person's send, however it came to
share a draft key.

## Decision

**A retry of the same draft by the same sender takes over its own claims still `PENDING` 30
seconds after they were made.** At the start of every send, one conditional `UPDATE` with the
whole predicate on the statement (0003) takes them: the claim begins with this draft and this
sender, the status is `PENDING`, and `created_at` is at least 30 seconds old. It moves each to
`FAILED_FINAL`, says in `error` that the send was interrupted and taken over, and renames its
claim to `interrupted:<claim>:<row id>`, which frees the key. The send's loop then claims that
person again in the ordinary way, with a fresh row, and sends. Two retries racing each take a
row at most once, since the first changes its status; and the loop's own claim still lets only
one of them send.

**The claim key names the sender.** `nightMessageClaim(draftKey, senderId, userId)` is
`night-message:<draft>:<sender>:<recipient>`, so "same draft, same sender" is one prefix,
compared with `substr()` rather than `LIKE`, which D1 caps at 50 characters of pattern.

**`created_at` is safe to read for the 30 seconds.** `claimNotification()` writes it once, the
moment of the claim, and nothing updates it: `notify()` and the H-105 retry move the status by
id or claim and leave it alone. The takeover only reads it. H-105's backoff reads `created_at`
for `FAILED` rows only, and a taken-over row is `FAILED_FINAL`, which is never retried; the fresh
row carries its own. The retention prune reads it unchanged. No column and no migration.

**A claim younger than 30 seconds is left alone** as a send that may still be in flight. The
answer counts copies already out (every earlier row of this draft and sender that is no longer
`PENDING`), copies resent, and copies still being sent, and the screen says each; for the last,
"N copies are still being sent; try again in a minute".

Everywhere else, 0048 stands: a stuck `PENDING` row is left visible and nothing sweeps it.

## Consequences

- A copy whose send went out but whose Worker died before recording it is sent twice. For a
  message about tonight, a duplicate is the lesser harm than a person who never hears.
- A send still running after 30 seconds, with a retry pressed meanwhile, can be sent twice; the
  first send's outcome then updates the new row, since both match the claim. The provider answers
  in well under a second, so this needs a send already failing slowly.
- A draft pressed before this change and retried after it has its claims under the old key, so
  the retry sends to everyone again. The page makes a new draft on every change and on every
  load, so this lasts only across a deploy mid-send.
- The taken-over row stays on the notification log as `FAILED_FINAL`, so the log still shows the
  interruption beside the copy that replaced it.

## Options considered

- **Reset `created_at` to take the row over in place.** Rejected. It rewrites when the copy was
  first claimed, which the notification log shows and the H-105 backoff and retention prune both
  read.
- **Delete the stuck row and claim afresh.** Rejected. The log feeds a subject access request,
  and the interruption would vanish from it.
- **Store the sender in an existing column.** Rejected. `session_id` is a training session and
  `record_id` the performance; overloading either misleads every other reader.
- **Sweep stuck `PENDING` rows everywhere.** Not decided here: the other claiming senders have
  their own reasons to stay at-most-once, and none has asked.
