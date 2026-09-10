# 0065: The training transform imports rehearsal's live history; G-127 stays withdrawn for the Heroku era it actually named

- Status: Accepted
- Date: 2026-09-10

## Context

`docs/backlog/K-platform.md`'s open questions record, as answered 26 August: "there is no legacy
training import (K-117 and G-127 resolved); the records do not map to the current module
system." G-127 itself, "Legacy data import as LEGACY records", was withdrawn the same day: "the
legacy records do not map to today's module system in any usable way, so no import runs...
historical training standing starts clean in the unified system." Read on its own, that looks
like a standing refusal to import any training history at all, current or otherwise, which is
exactly the reading this record exists to correct before it stops the training transform K-113
now needs.

Both resolutions are about a narrower thing: K-117 is titled "Legacy Heroku training data
import", and `rehearsal`'s own `legacy_module_map` table (`server/db/schema/catalogue.ts` there)
confirms why: `rehearsal` already absorbed one Heroku-era estate's history through a one-off,
spreadsheet-keyed import of its own, before this migration's scope begins. G-127's `source: TR-10
("the import was never written in the old estate either")` names that same Heroku-era gap, not
`rehearsal`'s own live database. `rehearsal` is one of the four apps this migration's `SOURCES`
already names (`migration/lib.ts`), the same tier as `auth`, `rooms` and `proscenium`, all
mechanically migrated without controversy. Its live `departments`, `sessions`,
`session_attendees`, `module_requests` and `records` tables are real, current, operational data,
not the Heroku archive G-127 refused.

## Decision

**The training transform (`migration/training.ts`, K-113) imports `rehearsal`'s live history: who
led a department, who ran and attended a session, who asked to be taught, and what training
record each person holds.** This is the same tier of import bookings and money already are, not a
revival of what G-127 withdrew. `rehearsal`'s own `LEGACY` record source, reserved and unused by
G-127's resolution, is repurposed here as the mapping target for an old `ADMIN`-sourced record,
which has no unified equivalent; nothing writes a genuinely Heroku-era record, because
`rehearsal` never held one to export in the first place.

**The catalogue is not imported.** `departments` and `modules` are authored fresh in the unified
system, the same way ticket types are (D-119), not migrated: several fields the unified schema
carries (delivery mode, safety-critical, sign-off required, self-registrable) have no source in
`rehearsal`'s catalogue to derive from, which is itself evidence the catalogue was always meant to
be re-authored rather than carried across. The training transform requires a populated catalogue
in its target and refuses to run without one, exactly as `transform-bookings.ts` requires
`out/room-map.tsv` first.

**`docs/backlog/K-platform.md`'s open-questions line is amended, not this record's own reasoning
restated there**, to say plainly that the resolution named the Heroku era only.

## Consequences

- A reader who meets "no legacy training import" in `K-platform.md` or G-127 and assumes it also
  covers `rehearsal`'s live database, the mistake this record exists to head off, now finds the
  correction at the point of confusion rather than having to trace it here first.
- G-127 itself is not edited: an accepted resolution is never rewritten, only superseded, and this
  record narrows nothing it actually decided. Reviving the Heroku-era import it withdrew would
  still need its own superseding decision, exactly as G-127 already says.
- `migration/README.md` gains a training section describing what is and is not carried across, the
  same shape booking and money history already have.
