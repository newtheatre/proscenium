# 0212: A rota email says when to arrive, and what actually happened

- Status: Proposed
- Date: 2026-10-21
- Amends: E-105 criterion 3, E-107 criteria 2, 3 and 5 (the rota's messages)

## Context

The hands-on run of 21 October 2026 read every rota email. The assignment gave the curtain
("Wednesday 21 October at 21:30") while the shift started at 20:30, so a volunteer reading it would
arrive an hour late. An officer's Unconfirm was headed "has been reassigned … to somebody else"
when nobody had been. The decline email said the shift "stays on the open list" when it stays off
it. The release notice said "Assign somebody from the rota" with no link, and called a withdrawn
claim "released". A claim that confirmed at once sent nothing, and with auto-confirm off nobody was
told a claim was waiting until the next morning's digest.

## Decision

- **An assignment and a confirmation carry the call time**, the shift's own start (0078), beside
  the performance's date and curtain. A claim confirmed at once sends the same `shift.approved`.
- **`shift.removed` says "reassigned" only when somebody replaced the holder.** A stand-down says
  they were taken off and the shift is open again. The caller says which with `replaced`.
- **The decline email says the shift stays off the open list** until the Front of House Manager
  fills it or the member dismisses the decline on their rota, as the officer's toast and the docs say.
- **The release notice links the rota board**, and a waiting claim taken back is "withdrawn".
- **A queued claim emails the rota's officers at once** (`shift.claim-waiting`, transactional),
  linking the board's waiting filter. The digest still lists it.

## Consequences

- One new message type, `shift.claim-waiting`, sent to the same officers a release notice reaches.
- A volunteer self-claiming with auto-confirm on now gets an email for it.

## Options considered

- **Email only claims inside 48 hours.** A claim further out waits just as long for an answer,
  and the volunteer waits with it; with auto-confirm off the queue is the officer's work.
