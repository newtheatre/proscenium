# ADR-0027: The refusals register is append-only, enforced by the database

**Status:** Accepted · **Date:** 2026-08-21 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

Challenge 25 refusals are recorded today in a paper register behind the bar. The bar module replaces
it ([13-bar-design §4.2](../13-bar-design.md)) with `age_checks`, which records both refusals and
accepted ID checks.

A paper register has one property that makes it evidence: you cannot go back and tidy it. Crossings
out are visible, and the book is in page order. A licensing officer asking to see the register is
relying on that. A database table is, by default, the opposite — a row that can be corrected in
place, by anyone with the endpoint, with no trace.

The pressure to edit is real and well-meant. Someone will log a refusal against the wrong product,
or type a description they regret, and the natural instinct is to fix it.

## Decision

**`age_checks` is append-only, and the database enforces it.**

- No update or delete endpoint exists, and none is to be added.
- SQLite triggers `BEFORE UPDATE` and `BEFORE DELETE` on the table `RAISE(ABORT, …)`, so the
  guarantee survives a future handler written by someone who has not read this.
- **Corrections are new rows**, carrying `supersedes_id` pointing at the row they correct. The
  register export shows both, in order, exactly as a crossing-out would.
- No names and no images, ever. The description field is for "tall man, grey coat, asked for a
  cider", and the schema has nowhere to put a photograph. Keep it that way.

Accepted checks are recorded too, as a bare tally. A register of refusals alone shows only the times
staff said no; the ratio of accepted to refused is the evidence that Challenge 25 is *operated*
rather than merely displayed on a poster.

## Alternatives considered

- **Soft delete with a `voided_at` column.** Reads as append-only and is not: the voiding is
  invisible in any query that filters it out, which every query will.
- **Application-level enforcement only.** One handler away from being untrue, and the handler that
  breaks it will be written in a hurry on a show night.
- **Refusals only, no tally.** Less to build, and it throws away the more useful half of the
  evidence.

## Consequences

- The export is the artefact that matters, because it is what goes across the counter at an
  inspection. It is laid out like the paper register: one page per date range, in order, readable on
  paper rather than only on a screen.
- Retention is unresolved and deliberately so — it waits on the data-protection policy, and until
  then rows are kept ([13-bar-design §8](../13-bar-design.md)). Whatever that policy says, deletion
  under it will be a schedule applied to the whole table, not a per-row correction, which is
  consistent with this record.
- A trigger cannot be expressed in the Drizzle schema, so it ships as **its own hand-authored
  migration file** alongside the generated ones. Authoring a new migration is not the same thing as
  editing a generated one, which stays forbidden; the file carries a one-line comment citing this
  record.
