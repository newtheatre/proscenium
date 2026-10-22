# 0238: A screen that cannot name its venue refuses in place of its controls

- Status: Proposed
- Date: 2026-10-22

## Context

On a night two venues ran, the Front of House Manager's backstage screen showed its controls with
"No standing calls yet" although calls were configured, **Show the code** did nothing, and a
typed call came back "Not sent". The read had been refused with a 400, which show-night screens
treat as a failure that keeps the screen (issue 1304), so every control stayed up and none could
work. On the crew's join form, **Join** was pressable with an empty or short code, and an old
refusal stayed beside the new one. On the message screen, the preview greeted the sender by name,
reading as if only they would get it, and once sent the screen said "what went out is below"
above a form that was not always what went out.

## Decision

- The guard's "more than one venue" refusal carries `chooseVenue` in its data, and a settled read
  holding it is a refusal like a 403: the screen draws the refusal card in place of its work. Any
  other 400 still keeps the screen. This reaches every show-night screen built on `refusalOf`.
- A refused **Show the code** says why under the button.
- **Join** waits until the join form parses, and a change to either field clears the last refusal.
- The preview greets **[their name]**, since each recipient's own name goes there.
- A sent message's subject and words are kept apart from the form and shown read-only under
  **What went out**, with the form and Preview hidden until **Write another**.

## Consequences

- With 0230 merged, the refusal names the hub as the place to choose the venue, so the card is
  also the way out.
