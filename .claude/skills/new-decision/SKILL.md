---
name: new-decision
description: Use when recording, amending or superseding an architecture decision in docs/decisions/, or when a change has no backlog story and needs a decision record before work starts.
---

# Recording a decision

Decision records are the repository's memory. Accepted records are never edited; they are
superseded. Anything that cost an evening becomes a record citing the incident.

## Writing a new record

1. Take the next number in `docs/decisions/` (four digits) and a short kebab-case filename
   stating the decision, not the topic (`0019-holds-release-to-the-waiting-list.md`, not
   `0019-holds.md`).
2. Structure: title as `# NNNN: <decision stated as a sentence fragment>`; a Status line
   (`Proposed` until the committee or IT Manager accepts, then `Accepted` with the date); a
   Date line; `## Context` (the forces, two paragraphs at most); `## Decision` (what is now
   true, present tense); `## Consequences` (what follows, including costs); optionally
   `## Options considered` with why the losers lost.
3. Add the record to the table in `docs/decisions/README.md`.
4. Style rules apply: no em dashes, British English, no tool references, write for a reader
   with no context.

## Amending and superseding

- A `Proposed` record may be edited freely until it is accepted.
- An `Accepted` record is never edited except to add a pointer line
  (`Superseded by NNNN`) when a later record replaces it.
- To reverse or materially change an accepted decision, write a new record whose Context
  names the old one and what changed, and mark the old one superseded.
- A committee-imposed constraint (for example the SU payment rule in 0005) is recorded as a
  decision with its external origin stated, so a successor knows it is not theirs to reverse
  from inside the repository.

## When a decision hides inside a task

If a review comment or implementation choice turns into an argument about what the system
should do, that is a decision escaping capture: stop, write the record, get it accepted, then
finish the change citing it.
