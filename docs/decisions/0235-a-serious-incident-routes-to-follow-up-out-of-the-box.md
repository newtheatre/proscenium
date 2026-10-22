# 0235: A serious incident routes to follow-up out of the box

- Status: Proposed
- Date: 2026-10-22
- Amends: migration 0074's seed, which left every severity closed until a committee member opted one in

## Context

Every severity was seeded with follow-up off, so a fresh install routed nothing: a serious
medical incident logged on the night reached nobody, and joined no list, until somebody had found
the Safety screen and switched it on. The warning on that screen and on the console overview only
helps somebody who goes and looks. When a severity was then switched on, its earlier incidents
appeared in the open follow-ups at once with no email and no word that they had. The email itself
read the database's values aloud ("A SECURITY incident logged at SERIOUS severity") and said
neither where nor when. And the reports' incident trends counted a corrected entry and its
correction as two.

## Decision

- **Serious** routes to follow-up from the start. Migration 0137 switches it on only where nobody
  has ever set it (`updated_by IS NULL`), so a committee's own choice, either way, stands.
- Switching a severity on answers with how many earlier incidents at it, with no closure, joined
  the open list, and the screen says so: those were never emailed and are read there.
- The follow-up email names the severity and category in words, the venue, and when it happened.
  It still carries nothing written in the entry (0011). It goes, as before, to every holder of
  `safety.write`: the Theatre Manager and every administrator. That is now documented rather than
  narrowed, because a serious incident reaching one more person is the safer failure.
- The incident trends count an entry only if nothing corrects it, so a chain counts once, as its
  latest correction. The night's own log still shows the whole chain.
- A correction on tonight's log shows when it was filed, since it keeps the time the original
  said the incident happened.

## Consequences

- Production's Serious row switches on at merge if nobody has touched it; anyone who wants it off
  turns it off on the Safety screen, and the migration will not undo that.
- The all-off warning stays for an install where somebody has turned every switch off.
