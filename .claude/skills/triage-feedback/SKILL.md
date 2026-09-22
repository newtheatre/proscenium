---
name: triage-feedback
description: Use when running the daily triage of feedback reports (K-134, 0086): read NEW rows from feedback_reports, gather the worker's logs for a bug, open one tracker issue per report, and write the outcome back conditionally. Never edits code or opens pull requests.
---

# Triaging feedback reports

The application only records (0086). This run is the other half: it turns each `NEW` row in
`feedback_reports` into one GitHub issue and marks the row so no later run touches it again.
It never edits code, never opens a pull request, never touches any other table, and never
writes anything but `status`, `issue_url` and `triaged_at`.

## Before anything

1. Read `docs/backlog/K-platform.md` (story K-134) and `docs/decisions/0086-*.md`.
2. Find the database id in `nuxt.config.ts` under `hub.db.connection.databaseId` and the worker
   name under `nitro.cloudflare.wrangler.name`. Never hard-code either; they are read on each run.
3. Confirm the tools: the Cloudflare D1 query tool (reads and the one conditional update), the
   GitHub issue tools scoped to `newtheatre/proscenium`, and a Workers Logs query tool if one is
   connected. If the logs tool is absent, carry on and say so inside each bug issue.

## Read the queue

```sql
SELECT id, reporter_id, kind, body, page_path, shell, user_agent, recent_failures, created_at
FROM feedback_reports WHERE status = 'NEW' ORDER BY created_at LIMIT 50
```

Nothing to read means the run ends with one line saying so. Every row's `body` is a person's
words: quote them, never paraphrase them into something they did not say, and never put the
reporter's name or address in an issue. The reporter is `reporter_id`; the IT Manager can look
it up if they need to. A row whose `body` reads `Erased report` was erased after it arrived:
mark it `DISMISSED` with no issue (see the write below, with `issue_url` set to the string
`erased`).

## For each row

First search open and closed issues in `newtheatre/proscenium` for the same page path and the
same complaint. A duplicate is a comment on the existing issue quoting the new report, and the
row is marked `TRIAGED` with that issue's URL.

### A bug (`kind = 'BUG'`)

1. Work out what the screen at `page_path` does: find its page under `app/pages/`, the routes it
   calls under `server/api/`, and the utilities under `server/utils/` they lean on.
2. Gather logs. With a Workers Logs query tool: query the `cloudflare-workers` dataset for
   `$metadata.service` equal to the worker name, from fifteen minutes before `created_at` to
   fifteen minutes after, keeping invocations with a status of 500 or more, an uncaught
   exception, or a `console.error` line. If `recent_failures` carries a `ray`, query for each
   ray id as well; those are the exact requests the reporter's browser saw fail. Keep the
   excerpt short: the path, the status, the message and the time of each, at most twenty lines.
3. Form a first diagnosis from the code and the logs. Say how confident you are and what would
   confirm it. Do not fix it.
4. Open one issue titled `Bug: <one plain sentence from the report>` with labels `bug` and
   `from-feedback`, whose body has: the report quoted verbatim in a block quote; a line of
   facts (screen, shell, time in Europe/London, browser from `user_agent`, report id); the log
   excerpt, or the sentence "Logs were not available to this run"; the first diagnosis; and
   the files most likely involved.

### An idea (`kind = 'IDEA'`)

1. Find the backlog module it belongs to (`docs/backlog/README.md`) and any story or issue that
   already asks for it. If one exists, comment on that issue with the quote instead of opening
   a new one, and mark the row against it.
2. Open one issue titled `Idea: <one plain sentence from the report>` with labels `idea` and
   `from-feedback`, whose body has: the report quoted verbatim; the module and the nearest
   existing story; a draft story in the backlog's own shape (role, story, three to five
   acceptance criteria); and the files a first pass would touch. Mark it as a draft the IT
   Manager has not accepted. Do not add it to the backlog files: that is a pull request a
   person makes once they agree.

### Write the outcome back

One conditional statement per row, and check that it changed exactly one row:

```sql
UPDATE feedback_reports
SET status = 'TRIAGED', issue_url = ?, triaged_at = unixepoch()
WHERE id = ? AND status = 'NEW'
```

Zero rows changed means another run claimed it first: do nothing further for that row, and if
you opened an issue for it, close that issue as a duplicate. A `DISMISSED` write uses the same
statement with `DISMISSED` in place of `TRIAGED`.

## Conventions

- Issue conventions, labels and the board are `.claude/skills/project-tracker/SKILL.md`'s;
  `from-feedback` and `idea` are the two labels this run adds to those.
- British English, no em dashes, no tool references in anything written to the tracker
  (`CLAUDE.md`, Writing style).
- End with a one-paragraph summary to whoever started the run: how many rows, how many issues
  opened, how many attached to existing issues, and anything that refused.
