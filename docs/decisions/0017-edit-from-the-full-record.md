# ADR-0017: Edit from the full record, on the page, not from a list row in a modal

**Status:** Accepted · **Date:** 2026-08-14 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

Managing a show meant opening `/admin/shows`, reading a summary card, opening a 600-line modal
containing the same details again, editing, saving, and watching the dialog close.

That indirection concealed a data-loss bug. The list endpoint returns a **column projection**
([ADR-0005](0005-paginate-list-endpoints-in-sql.md)), and the modal was opened with the list row. Five
fields the form could write: `longDescription`, `programmeUrl`, `externalUrl`,
`contentWarningNotes`, `warningsConfirmedNone`: were never read into it, so saving a title change
wrote nulls over them. The modal carried a guard against being opened with an incomplete row, which
is a symptom of the design rather than a fix. Recorded in
[docs/09-known-issues.md](../09-known-issues.md) as "Editing a show wiped its write-up".

## Decision

**Anything that edits a record reads it in full first, and edits it in place on its own page.**

- `GET /api/shows/:id` returns **every** column, unlike the list projection. That is its purpose:
  anything that edits a show reads it from there.
- `/admin/shows/:id` is where a show is managed. Its fields are sections on the page: details,
  content warnings, ticket types, performances: not dialogs over a summary.
- Sections save independently. `PUT /api/shows/:id` accepts a partial body, so each section writes
  only what it owns and cannot null a field it never displayed.
- Fields that were previously invisible are on screen, where a wipe would be obvious.

Modals remain correct for **creating** a record, and for operations that are genuinely a separate
transaction (collecting a reservation at the door, selling a pass). The rule is about editing an
existing record from a projection.

## Consequences

- The five fields cannot be silently nulled, because the form that writes them also reads them.
- Content warnings are their own section rather than part of the details form: a separate concern
  with a separate vocabulary ([ADR-0004](0004-content-warning-model.md)) and its own save.
- Buffered editing is kept where a row can mean "delete the override" as easily as "write one":
  show-level ticket-type overrides commit together on save, so a half-finished price change is not
  made permanent one toggle at a time.
- A page is a worse fit than a modal for a genuinely short interaction. This decision does not apply
  to those.
