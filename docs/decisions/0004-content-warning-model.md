# ADR-0004: Model content warnings as kind + level, and reseed the vocabulary

**Status:** Accepted · **Date:** 2026-08-14 · **Deciders:** Matt Adcock (ITM 26/27)

Supersedes the content-warnings portion of [ADR-0003](0003-legacy-ticketing-import.md).

## Context

ADR-0003 imported the legacy content warnings as it found them, to avoid losing anything. What it
found was a model nobody had designed:

**424 vocabulary rows, 384 distinct titles, uncurated.** `Alcohol`, `Alcohol abuse`, `Alcoholism`,
`Alcoholism and Drinking`, `Drinking` and `Underage Drinking` were six separate entries. 361 titles
were actually in use across 998 links, and 201 of those were used exactly once: `Blasphemy against
Shakespeare`, `Second-hand embarrassment`, `Covid-19`. The list grew that way because companies
could type a new warning at will and nothing ever merged them.

**Three "axes" (`TECHNICAL` / `ACTION` / `DIALOGUE`) that conflate two different things.**
Technical effects are a *category of warning*: strobe, haze, loud noise. Action-versus-dialogue is an
*intensity*: shown on stage versus talked about. Putting all three on one enum meant the schema could
not say "murder is discussed at length but never staged", and the uniqueness key `(show, warning,
axis)` let the same warning appear on a show twice, which the public page had to dedupe in the
browser.

**No way to change any of it from the application.** There was one read-only endpoint and no admin
screen. Adding, renaming or retiring a warning required a database migration.

How the theatre actually talks about this is simpler. Technical warnings are a small closed set that
either applies or does not. Everything else is a theme that features at one of three strengths:
**mentioned**, **discussed**, **depicted**.

## Decision

**Replace the axis model with `kind` + `level`, wipe the vocabulary, and ship a curated one.**

`content_warnings` gains `kind` (`TECHNICAL` | `GENERAL`), `category`, `slug`, `description` and
`sort`. `show_content_warnings` replaces `kind` with a nullable `level` (`MENTIONED` | `DISCUSSED` |
`DEPICTED`) and narrows its unique index to `(show_id, content_warning_id)`: one level per warning
per show.

`level` is null exactly when the warning is technical. SQLite CHECK constraints may only reference
columns of the same row, so that invariant is enforced in `PUT /api/shows/:id`, which looks up the
submitted warnings' kinds before writing. The CHECK constraints that *are* present constrain the
enums, which drizzle's `enum` option does not: it is a TypeScript union that emits no SQL.

The seeded vocabulary is **10 technical effects and 55 themes across nine categories**, curated and
then cross-checked against production usage so nothing the NNT actually uses is missing.

The foreign key from a link to its warning is `onDelete: 'restrict'`, not `cascade`. Under cascade, a
delete from the new admin page would have stripped that warning from every show carrying it with no
warning and no trace. Archiving is the retirement path, as it is for ticket types.

### What happened to the old data

Both tables were copied verbatim into `content_warnings_archive` and `show_content_warnings_archive`
before anything was dropped. A hand-written alias map: derived by reading all 361 distinct titles in
use, ranked by usage: remapped **963 of 998 links (96.5%)**.

The 35 it did not carry are titles too vague to restate: `Adult content` (6 uses), `Adult themes`
(5), `Lying and Deceit` (3), `Political Themes` (2). Inventing a specific meaning for those would
have been worse than admitting they were dropped, so they stay in the archive and surface in the show
editor's "not carried over" panel for a human to replace. Exactly one show: *Bonfire Man: Ben
Macpherson*, whose only warning was `Adult themes`: came out with nothing, and it falls back to the
neutral "no content warnings recorded" state rather than falsely claiming none.

`show_content_warnings_archive.mapped_to_warning_id` records what each archived row became. That
column exists because the remap *collapses*: `Sexism` and `Misogyny` both became `sexism`, so only
one of the two archive ids survives as a live row, and deriving "did this carry over?" by looking for
missing ids would report the other as dropped.

Nothing maps to `DISCUSSED`. Legacy could not express it: `ACTION` became `DEPICTED`, `DIALOGUE`
became `MENTIONED`, and inventing the middle value would have been a claim no company made.

At the time of the migration the most recent performance in the database was 2026-06-12 and nothing
was on sale, so no customer-facing show was affected by the remap.

## Consequences

- Someone browsing a show can tell a murder staged in front of them from one mentioned in passing.
  That distinction is the point of the change and the old schema could not hold it.
- The vocabulary is manageable from `/admin/content-warnings` without a deploy.
- A warning can no longer appear twice on one show, so the browser-side dedupe is gone.
- Free text is gone from the picker on purpose. Unrestricted creation is what produced 384 titles;
  adding an entry is now a deliberate act on the vocabulary page.
- The show editor refuses to save a theme with no level. A silent default would publish a claim about
  a production that nobody made: the same failure the public page's three states exist to prevent.
- 35 legacy links are no longer shown to the public. They said nothing useful, and they remain in the
  archive and in the editor.

## Notes for future migrations

Migration `0016_lying_maverick.sql` was generated and then hand-edited before being applied
anywhere, which `CONTRIBUTING.md` permits (only *applied* migrations are immutable) and
`0014_flashy_odin.sql` had already set a precedent for. Two things made the generated version
unusable, and the second is a general fact worth carrying forward: see
[docs/08-operations.md §5](../08-operations.md).

1. Both of drizzle's `INSERT … SELECT` rebuild steps read columns that did not exist yet (`slug`,
   `level`). Nothing was meant to carry over anyway.
2. `DROP TABLE content_warnings` drops a *parent*. D1 runs every migration inside an implicit
   transaction with foreign keys enforced and documents that a query cannot turn them off, so
   drizzle's `PRAGMA foreign_keys=OFF` is inert there: the drop would have cascaded into
   `show_content_warnings` and emptied it before the archive copy ran.

The final file archives first, drops child then parent, recreates, seeds with literal `cw_<slug>`
ids so a warning means the same thing in every environment, and remaps last. It was rehearsed against
a full copy of production data before being applied.
