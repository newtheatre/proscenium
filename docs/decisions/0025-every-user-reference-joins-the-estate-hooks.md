# ADR-0025: Every user-referencing column joins the estate hooks, checked in CI

**Status:** Accepted · **Date:** 2026-08-21 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

This app holds a thin mirror of the people who have booked something, and the auth service calls
four hooks against it: `anonymise`, `export`, `last-activity` and `merge`
([04-auth-and-permissions](../04-auth-and-permissions.md)).

`mergeUser` re-points every column that references a user onto the winning account. It does this by
naming them, one by one, in a hand-written batch. Its own comment reads "All four user-referencing
columns re-point", which is true today and is exactly the kind of sentence that stops being true
without anyone noticing.

The three designs now agreed add roughly **twenty** more: the rota's `user_id` and
`assigned_by_user_id`, the access profile's `user_id` and `verified_by_user_id`, and, in the bar
module alone, `taken_by_user_id`, `voided_by`, `comp_approved_by_user_id`, `requested_by`,
`decided_by`, `checked_by_user_id`, `opened_by`, `closed_by`, `received_by`, `started_by`,
`finished_by`, `entered_by`, `created_by` on two tables, and the incident log's author.

A missed column does not fail loudly. A merge silently leaves rows pointing at a deleted mirror row,
or an erasure leaves a name attached to a record that was supposed to lose it. Both are the sort of
bug found a year later by someone who is not looking for it.

## Decision

**Wiring a new user reference into the hooks is part of creating it, and CI checks that it happened.**

A script, `scripts/check-user-references.mjs`, run by CI beside `check:comments`, reads the Drizzle
schema, finds every column referencing `users.id`, and asserts that each one is either handled in
`mergeUser` or listed in a small, explicitly justified exclusions block in the same file. A new
column that is neither fails the build, with a message naming the column and pointing here.

Each new reference is also classified against the other two hooks, and the classification lives
beside the exclusion list rather than in someone's memory:

| The column is | `merge` | `anonymise` | `export` |
|---|---|---|---|
| The subject of the record (the customer's own booking, their access profile) | re-point | anonymise, or **delete** where the design says so | include |
| Staff attribution (who took it, who approved it, who counted it) | re-point | leave: it is a record of who acted, not of the subject | not the subject's data |

The script is a lint, not a test. This repo's CI gates on lint, typecheck and build and has no test
suite, so a check shaped like `check:comments` is the one that will actually run.

## Alternatives considered

- **A convention, written in CONTRIBUTING.** The convention already exists in effect, and the four
  hand-listed columns are what it produced. Twenty more will not improve its odds.
- **Reflection at runtime**, walking the schema and re-pointing everything generically. Tempting,
  and wrong: the three-way classification above is a judgement per column, not a rule. A generic
  merge would also silently start re-pointing a column somebody added for another purpose.
- **A test suite.** The right home for this in a repo that had one. Adding vitest to Proscenium to
  hold a single check is a larger change than the check.

## Consequences

- Adding a user-referencing column now costs a second file's worth of thought. That is the intent:
  the cost is small at the moment of writing and large a year later.
- The exclusions block is the honest record of things deliberately not wired, and it needs a reason
  per entry, not a blanket comment.
- Access profiles are the sharpest case: the design requires **deletion** on erasure, not
  anonymisation, which is a departure from
  [ADR-0014](0014-anonymise-never-delete.md)'s default and is justified in
  [ADR-0022](0022-access-needs-are-special-category-data.md). The classification table is where that
  exception is recorded so it is not mistaken for an oversight.
