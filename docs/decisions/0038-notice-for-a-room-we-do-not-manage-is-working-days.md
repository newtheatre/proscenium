# 0038: Notice for a room we do not manage is working days, and a gap in the calendar refuses

- Status: Accepted
- Date: 2026-09-01

## Context

Asking for a room we do not manage means a person filling in somebody else's form and waiting for
an answer. The Students' Union, whose rooms these mostly are, needs **three working days**: not
three days. Saturdays, Sundays and bank holidays are not days on which anybody reads the form.

C-120 shipped with a notice window of ten calendar days, which was a placeholder chosen because
nothing in the system could count a working day. Ten calendar days is both wrong and, on average,
too generous: it refuses asks that would have been fine and it does not model the rule anybody
actually applies.

Two things about the rule are easy to get backwards, and both were stated explicitly when it was
given to us:

- **The count applies to the gap, never to the booking.** A Saturday get-in is ordinary. A Sunday
  rehearsal is ordinary. A bank holiday meeting is ordinary. What is not ordinary is asking for one
  of them on the Friday before.
- **The clock starts when the member asks**, not when the form goes in. Those differ by however
  long the request sits in the queue, and starting it at the form would let a member ask for
  something already impossible and only learn so after the wait.

## Decision

**Notice is counted in working days, from the member's ask, over a configured list of bank
holidays. Where the list does not cover the period being counted, the request is refused rather
than judged.**

`shared/utils/working-days.ts` is pure: `isWorkingDay`, `workingDaysBetween`, `addWorkingDays`. It
counts London calendar days (0014) and skips Saturday, Sunday and any date the list names.
`EXTERNAL_REQUEST_NOTICE_WORKING_DAYS` replaces `EXTERNAL_REQUEST_NOTICE_DAYS`, defaulting to
three. `BANK_HOLIDAYS` is an ordinary committee-editable list of `YYYY-MM-DD` dates, defaulting to
the published England and Wales dates, in the family of every other list the committee owns (0033).

### The refusal is the point

A list of dates runs out. Nobody notices, because nothing breaks: the arithmetic keeps working and
simply counts a bank holiday as a working day. The member is then granted **less** notice than the
rule requires, which is the exact failure the rule exists to prevent, and the first anybody hears
of it is somebody turning up to a room that was never booked.

So the judgement refuses, with its own named reason, whenever the list does not reach the date
being judged. Three consequences, all deliberate:

- An **empty** list refuses everything rather than treating every day as a working day. A committee
  clearing the field by accident gets a loud failure, not a quiet one.
- The refusal names the last date the list covers, so the person reading it knows what to do.
- `/api/health` reports coverage that falls short of the booking horizon, and the settings screen
  shows the last covered date beside the list, so the shortfall is visible **before** anybody is
  refused rather than at the moment they are.

This is the same shape as the migration health check (0021): the failure that costs an evening is
the one that looks like success, so make it look like failure instead.

## Consequences

- The window is now shorter in calendar terms than the ten days it replaces, so a few asks that
  would have been refused will pass. That is correct; ten was never the rule.
- The list needs refreshing. It ships covering the published dates and the health check says when
  it is running out; the committee handover each August is when it should be extended.
- The list is not fetched from an API. A yearly value does not deserve a request-time network
  dependency, and a fetch that fails would land us back at counting a bank holiday as a working
  day, which is the thing this record exists to prevent.
- Our own rooms are unaffected. Their notice is a number of hours
  (`ROOM_AUTO_APPROVE_NOTICE_HOURS`), so the working-day question does not arise for them, and
  nothing here touches the policy engine.
