# ADR-0034: An open sandbox closes only on a definitive answer

**Status:** Accepted · **Date:** 2026-08-23 · **Deciders:** Matt Adcock (ITM 26/27)

Refines [ADR-0033](0033-the-practice-window-fails-closed.md), which stands.

## Context

ADR-0033 says the practice window fails closed, and lists "no token, unreachable service, timeout,
malformed answer, unknown key" as all meaning no sandbox. That was written about **opening** one, and
it is right about opening one.

Applied unchanged to a sandbox already open, it is destructive. `GET /api/training/state` is polled
once a minute and re-asks rehearsal so that a lead marking the register ends the sandbox here within
a poll (`docs/14` §9). Because `practiceWindow()` returned the same closed answer for "rehearsal says
the window is shut" and "rehearsal did not answer", one timeout during a lesson ended the run. Ending
a run also deletes its events, so the debrief trail went with it. A review found this; it was not
theoretical.

## Decision

`practiceWindow()` returns a **three-state** answer: `OPEN`, `CLOSED` or `UNREACHABLE`.

- **Opening** a sandbox requires `OPEN`. `UNREACHABLE` refuses, exactly as ADR-0033 requires, and now
  says so in the refusal rather than implying the trainee is not being taught.
- **Closing** an open sandbox requires `CLOSED`. `UNREACHABLE` changes nothing: the run continues on
  the expiry rehearsal already gave it, which bounds it regardless.

A `404` on the target key is `CLOSED`, not `UNREACHABLE`. A retired or renamed target is a definite
answer that no such sandbox exists, and it stays loud in the log because it is a configuration break
across two repos.

The asymmetry is the point, and it is the same balance-of-harms ADR-0033 struck, applied to a
different moment. Refusing to open costs a trainee an evening. Closing wrongly interrupts a lesson in
progress and destroys its trail, and it does so precisely when the training system is already having
a bad day. `expires_at` is the backstop that makes waiting safe: an unreachable rehearsal cannot
extend a sandbox, only fail to shorten one.

## Alternatives considered

- **Leave it as ADR-0033 literally reads.** Rejected: it makes a transient blip destructive, and the
  destruction is silent to the trainee beyond the banner vanishing.
- **Retry before believing a closure.** Rejected as insufficient rather than wrong: a retry narrows
  the window but keeps the same conflation, and the poll is once a minute anyway.
- **Stop deleting events when a run ends.** Rejected here, though it would soften the symptom: events
  are scratch data and their deletion is the reset ADR-0032 promises. The fix belongs at the point
  where the wrong conclusion is drawn, not in what that conclusion destroys.

## Consequences

Good: a training-system outage no longer interrupts lessons already under way, while still preventing
new sandboxes; the refusal message now distinguishes "you are not being taught this" from "the
training system is not answering", which are different problems for the person reading it.

Bad: a sandbox can now outlive a window that was closed during an outage, up to its `expires_at`. That
is bounded, and the trainee is in a fixture either way, so the cost is a sandbox that stays open
slightly too long rather than any reach into real data.
