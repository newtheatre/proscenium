# 0092: Bank holidays are synced from gov.uk and never typed, and a failed sync warns

- Status: Accepted (IT Manager, 24 September 2026)
- Date: 2026-09-24
- Supersedes in part: 0038 (the list's source and who may edit it; everything else stands)

## Context

0038 made `BANK_HOLIDAYS` an ordinary committee-edited list and refused requests once it ran out,
and said plainly that the list is not fetched from an API, for two reasons: a yearly value does
not deserve a **request-time** network dependency, and a fetch that failed would land us back at
counting a bank holiday as a working day. Both reasons are about fetching while a member waits.
Neither applies to a scheduled copy: the list is read from the database exactly as before, and a
sync that fails changes nothing. What 0038 did leave in place is a person typing dates in once a
year, which is the step a committee that turns over every summer forgets, and a typed date can be
wrong in a way a refusal never catches.

The government publishes the England and Wales dates, including one-off holidays and moved ones,
at `https://www.gov.uk/bank-holidays.json`, about two years ahead. Nothing in the Worker calls a
third party today, so this is also the first outbound call, and it needs its limits written down.

## Decision

**`BANK_HOLIDAYS` is written only by the `bank-holidays:sync` task, from gov.uk's
`england-and-wales` events. The settings write path refuses it by hand. A sync that fails leaves
the list exactly as it was and says so, on `/api/health`, on the settings screen, and to the IT
Manager if it stays failing.**

### The outbound call

- **One URL, fixed in code**: `GET https://www.gov.uk/bank-holidays.json`. No configured URL, no
  query string, no credentials, no body, and nothing about any person leaves the Worker.
- **Ten seconds**, by `AbortSignal.timeout`, then it is a failure. Redirects are not followed: a
  response that is not a plain 200 is a failure.
- **Validated before anything is written**: the body is at most 512 KB of JSON, parsed with zod
  (`shared/utils/bank-holidays.ts`): an `england-and-wales` division with at least one event, each
  date a real `YYYY-MM-DD` calendar date. A feed whose last date is before today is refused as
  out of date, because a list that has stopped moving is exactly what 0038 exists to catch.
- **A failure has a fixed vocabulary** (`timeout`, `network`, `http`, `too-large`, `not-json`,
  `invalid`, `out-of-date`, `write`) and is recorded as that word, plus the status code for
  `http`, never a response body: the audit trail carries no free text (0011).

### What a successful sync writes

The feed is authoritative from its first date onwards, so a moved or cancelled holiday is
corrected. Dates already stored that fall **before** the feed's first date are kept, because
gov.uk drops old years and a request asked before then is still counted from its ask (0038). The
result is checked against the key's own schema (0012) and written in one batch (0001): the
`config` row, a `config.changed` entry only when the list actually differs (conditional on the
stored value, so two overlapping runs cannot audit the same change twice, 0003), and a
`bank-holidays.synced` entry.

### The actor

The list's `config` row and its `config.changed` entry carry **no actor**, which the trail
renders as "system": the dates are gov.uk's, not the person's who asked. The
`bank-holidays.synced` or `bank-holidays.sync-failed` entry carries whoever pressed **Sync now**,
or no actor when the cron ran it, so the trail still says who asked for a run.

### Where the state lives

The list stays in `BANK_HOLIDAYS`, so the four places that read it (C-121's judgement, the form
deadline, the queue and the health check) do not change. The last sync and the last failure are
**not** configuration: 0025 says configuration is a rule rather than a record, and "when did this
last work" is a record. They are read back from the append-only audit trail (0010), newest
`bank-holidays.synced` and `bank-holidays.sync-failed` by the existing `audit_log_action` index.
A table of our own would hold the same facts twice.

### When it runs, and the warnings

- Weekly, Monday 05:00 UTC, on the cron trigger `backup` already uses (no new trigger), and by
  hand from **Sync now** on the settings card (`config.write`), which is also how a fresh
  environment gets its first sync.
- `/api/health` reports the sync beside the coverage it already reported: `synced`, `failed` (the
  newest attempt failed), `stale` (no success for eight days, one missed weekly run and a day's
  slack) or `never`. Like coverage it is reported and never part of `ok`: a gov.uk outage is not
  our site being down, and `health:watch` pages on `ok`.
- The IT Manager (every live `ADMIN` grant) is told through the notification centre once a failure
  streak is six days old, which is the second failed weekly run: one `bank-holidays.sync-failed`
  message per person per streak, claimed like any other send (0048), so a recovered sync followed
  by a new failure alerts again.
- These three figures (ten seconds, eight days, six days) follow from the weekly cron in
  `nuxt.config.ts`, not from a committee rule, so they are constants beside the code rather than
  settings (0012 covers rules the committee sets).

## Consequences

- Nobody extends the list at handover any more. The shipped default (the published dates to the
  end of 2028) stands until the first sync replaces it.
- A manual correction is impossible by design. If gov.uk is wrong the fix is theirs; if the feed is
  gone for good, this record is superseded rather than worked round in the settings screen.
- The Worker now makes an outbound request. Workers may fetch public HTTPS hosts by default, so no
  Cloudflare setting is needed; if egress is ever restricted, `www.gov.uk` must be allowed.
- A failed sync costs nothing until the list runs out, which is still refused and still reported
  (0038). The warnings exist so the list never gets that far.

## Options considered

- **Fetch at request time** (0038's rejected option): still rejected, for 0038's reasons.
- **Sync, and keep manual editing as a fallback**: refused by the IT Manager. Two writers means a
  typed date the next sync silently overwrites, or a sync that must decide whose date wins.
- **A table for sync state**: duplicates the audit trail, and needs a migration for two facts.
