# 0239: The night report says what happened, and to whom

- Status: Proposed
- Date: 2026-10-22
- Amends: E-124's distribution (roles shipped unset) and `admittedWalkUpSeatsSubquery`'s walk-up line

## Context

A process walk of 21 October 2026 closed two nights and found the report saying less than it
seemed to. With `NIGHT_REPORT_ROLES` unset on a fresh install, the signed report went only to
whoever signed it: the Front of House Manager and the Theatre Manager never saw either night,
and nothing warned that they would not. The email came from "NNT Accounts", was headed by the
venue and an ISO date, and carried neither a figure nor the show's name. On the screen, the
walk-up line counted only walk-ups already scanned in, so it read nought while they queued; a pass
admission was in **In** but nowhere else; **No-shows** read before the curtain as if the night were
over; the card reader's figure was the whole night's at every venue, unlabelled; and **Sign off
and close** greyed out with no reason while the note was empty. Once signed, the hub still led
with the gold **Sign off and close** tile, and no screen anywhere opened a signed report again.

## Decision

- `NIGHT_REPORT_ROLES` ships with a default of the Front of House Manager and the Theatre
  Manager, the two posts the constitution gives the nights and their safety. A stored value,
  production's included, still wins; the workshop row stays open for the full list.
- Every night report email (signed, corrected or closed by itself) comes from The New Theatre,
  not the accounts mailbox: it is the night's record, not a bill. `sendRaw` takes a sender.
- The signed email's subject is the show, a British date and the signer's first name, and its
  body leads with sold, in, no-shows, incidents, box office and bar before the closing note.
- **Walk-ups sold** counts door-sold seats still holding, admitted or not, by one subquery in
  `capacity.ts` beside the rest of the seat counting (0007). Pass admissions get a line.
- Before the curtain is down, **No-shows** reads **Paid, not yet in**. The card reader line says
  it is the whole night at every venue. A hint under the button says the note is what it waits for.
- Once tonight's performance is closed, the hub's report tile reads **Signed off by …**.
- A signed report opens again from its row on /reports, frozen as it was, with its corrections,
  who it reached, and a form to add a correction (the addendum route had no screen). It is read
  with `night.manage` or `safety.read`, not `reports.read`: the Committee role holds the latter
  for season aggregates, and the report carries each incident's own words.

## Consequences

- A fresh install mails two officers every night without anybody choosing them. A committee that
  wants fewer stores an empty list on Settings; the closer always receives it regardless.
- Replies to a report now reach the theatre's general mailbox rather than the accounts one.
