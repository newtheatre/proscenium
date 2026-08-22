# ADR-0003: Import the legacy ticketing data, with an archive layer and a retention line

**Status:** Accepted · **Date:** 2026-08-10 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

`ticketing.newtheatre.org.uk`: a Python 2.7 / Django 1.10 app on Heroku, schema frozen since
November 2019, last booking 14 June 2025: holds the theatre's only record of what it staged.
64,289 rows across 27 tables: 477 shows back to October 2013, 1,255 performances, 25,637
reservations, 16,255 box-office sales totalling £105,259.50, 424 content warnings and a 2,782-row
admin audit trail.

Nothing else holds it. The old Jekyll website fetched shows from the ticketing API at page load and
persisted none of them, and its API only ever returned current and future shows. Archiving that
repository preserves zero productions.

Proscenium as it stands cannot hold about a third of the legacy model: no show categories, no
content warnings, no passes, no programmes, no booking windows, no audit trail, and no legacy
identifiers. And it cannot hold a reservation without a user, so a naive import creates 9,501 shadow
accounts from decade-old audience data, which, under the planned auth service, would
become central identities across the whole estate.

## Decision

**Import, with two layers and a retention line.**

**Layer 1: extend the live schema** so the data is usable, not merely kept: `show_categories`,
`content_warnings` + `show_content_warnings`, `venue_aliases`, `ticket_types.kind`/`archived`,
`tickets.priceConfidence`, `performances.bookingClosesHoursBefore`, `reservations.legacyRef`/
`source`/`originalQuantity`, `shows.programmeUrl`/`externalUrl`/`longDescription`.

**Layer 2: a verbatim archive.** `legacy_records` holds every source row as JSON keyed by
`(source_table, source_id)`; `legacy_id_map` maps every legacy row to what it became, with a
confidence of `DIRECT`, `MATCHED` or `SYNTHETIC`. Together they make the import reversible and
re-derivable from inside the database.

**Retention.** Bookers whose most recent activity is on or after 1 August 2023 keep their name and
email. Older bookers become stable pseudonyms: distinct, so repeat-booker and attendance analysis
survives: with the derivation salt destroyed at the end of the run. Against that line: 1,225
identifiable bookers, 8,276 anonymised.

**Sequencing.** Run this import *before* the auth service cutover.

## Alternatives considered

- **Start clean; keep the dump as a file.** Simplest, and it is what "archive the old system"
  usually means. Lost because a `pg_dump` on a laptop is not an archive an Archivist can query, the
  attendance figures per performance exist nowhere else, and the theatre would permanently lose the
  ability to answer "what did we stage in 2017?" from its own website.
- **Import into a separate read-only archive database.** Clean separation, no risk to the live
  schema. Lost because it makes the history a second-class citizen: the point is that a 2014 show
  should appear in the same `/whats-on/<slug>` space as a 2027 one.
- **Live tables only, no archive layer.** Lost because every mapping decision here involves
  inference: 12,251 of 13,025 named sales are matched to a reservation by fuzzy name, not a foreign
  key, and inference without the original is unrecoverable when it turns out to be wrong.
- **Import all 9,501 bookers identifiably.** Maximum archival completeness. Lost because none of
  those people consented to an account, most last interacted years ago, and the auth service would
  promote them to estate-wide identities.
- **Anonymise everything.** Lost because it discards the current audience: the people the box
  office will actually see this term: for no privacy gain over a three-year line.

## Consequences

**Good.** The theatre's programming history becomes queryable in the system people actually use.
Revenue and seats reconcile exactly: £105,259.50 and 23,775 seats, asserted by the verification
harness. Every legacy row remains recoverable through `legacy_records`, and every imported row
traceable through `legacy_id_map`. The personal-data surface shrinks by 87%. The `kind` column added
for legacy pass counters is the same one the passes feature needs.

**Bad.** Nine new tables and fourteen new columns, several serving history rather than current
operations. Revenue queries must union legacy pass tickets with new pass records
([ADR-0002](./0002-passes-as-first-class-entities.md)). About 22 MB of JSON archive in the
operational database. The 8,276 anonymised bookers can never be re-identified: that is the point,
and it is irreversible, so the retention line must be agreed by committee before the run rather than
inherited from a script default.

**Accepted risks.** The sale-to-reservation link is inference: 774 named sales had no free
reservation to attach to and become standalone door sales. 21,732 tickets carry
`priceConfidence = UNKNOWN` because their reservation was never settled by a sale, so no price was
ever recorded. Ten venue mappings were inferred from 38 free-text strings and need a human who
remembers whether "Studio Live" meant Studio A, Studio B or a stream.

**Time-critical and outside this decision.** 329 poster images and 13 programme links are *not* in
the database: they are paths and URLs served by the Heroku host. They die with it. Fetch them
first.
