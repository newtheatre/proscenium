# 0241: A register tells only who had a place, and a correction moves only what changed

- Status: Proposed
- Date: 2026-10-21
- Amends: G-114 criteria 2 and 3 (correcting a register), G-116 criteria 2 and 3 (marking)

## Context

The hands-on map of 21 October 2026 drove a register on the day and found these problems.

- Somebody only ever on the waiting list was on the register, and if left unmarked was emailed
  "we did not see you there", although they never had a place.
- A correction revoked every record the session had issued and issued the corrected set again.
  People whose mark had not changed ended up with a Revoked row beside a Valid one. Somebody the
  correction dropped got the absentee email ("Nothing on your record has changed") just after
  their record was revoked, and somebody it added was never told.
- A session nobody signed up for, where every walk-in was refused, could not be submitted: the
  confirmed empty submission was refused with "Mark at least one person". The session then showed
  "Open for sign-up" with its register open.
- The walk-in panel's first **Add them** only ran the prerequisite check, a check run on one
  address was still shown after the address changed, and a refusal from the panel was shown
  again after an unrelated Submit.

## Decision

1. **The absentee email goes to who was expected.** That means somebody who signed up and held a
   place in the order when the register was marked. A waiting-list name and a walk-in the trainer
   unticked get no record and no email. The email names what was taught and the day in words.
2. **A correction touches only the people whose mark moved.** Somebody marked present who was
   absent gets their records; somebody unmarked who was present has theirs revoked with the
   reason. Everybody else's record is left alone. The revoke is scoped through `json_each`, one
   parameter however many people (0003).
3. **A correction tells each person it moved which way:** `training.session.withdrawn` or
   `training.session.added`, keyed to the correction so a later one tells them again. Nobody else
   is emailed.
4. **An empty register closes once confirmed.** `marks` may be empty when `confirmedAllAbsent` is
   true. A correction still needs at least one mark.
5. **An opened register reads "Register open"** in the sessions list and on the session page,
   whatever the stored badge says.
6. On the register screen, the gap warning says "Not added yet". It is cleared when the address or
   the pick changes, and the panel's error is cleared when it closes or a submit starts. A cancelled
   session's register says it was cancelled. A link to a register before its day says when it opens.

## Consequences

- An old session corrected before this change keeps its paired rows: history is not rewritten.
- The audit entry for a correction still counts present, absent, revoked and issued. Under this
  rule `revoked` and `issued` count only the people moved.
