# 0244: A self-registrable brief is recorded by its reader

- Status: Proposed
- Date: 2026-10-22
- Amends: G-208 criteria 1, 3 and 4 (brought forward from V2, without the posters)

## Context

A brief can be marked **People can register themselves for it**, and the catalogue has stored
the flag since G-107. Nothing read it. The hands-on map of 21 October 2026 found a brief with
the switch on still offering only **Ask for this module** or **Sign up**, so the switch promised
something the site did not do.

G-208 describes the whole of self-registration: a QR poster on the wall of the room, a signed
link, an optional window, and a report for leads. Building all of that is V2 work. Hiding the
switch would leave the flag in the schema with no way to use it.

## Decision

1. **A self-registrable brief offers its reader "I have read this"** wherever a module's one
   action is shown (the catalogue, its page, My training, the rota's role cards). It comes after
   a held or waiting place and after the committee-only refusal, and before signing up or asking.
2. **Pressing it writes a `SELF` record** dated today in London, with no expiry, granted by the
   reader. Only an active brief with the flag qualifies, and a committee-only one still needs a
   committee role.
3. **It is idempotent within the day.** The insert is conditional on no live record for that
   person, brief and day, so a double press writes one record and one audit entry
   (`record.self-registered`).

## Consequences

- G-208's posters, signed links, windows and lead reports remain V2. When they arrive they
  write the same record through the same rule.
- A member reads the brief's material links before pressing. Nothing checks that they did: a
  brief gates nothing and never expires (G-208 criterion 1), so this costs nothing on safety.
