# 0086: Feedback is a queue row, triaged by a daily run outside the worker

- Status: Proposed
- Date: 2026-09-22

## Context

Anybody working a console or show-night screen can find a defect or see an improvement, and
until now the only route to the IT Manager was an email written later, if at all. The one
precedent, reporting documentation drift (J-109), is an audit line and a notification with no
queue behind it (`docs/known-issues.md`). A report is only useful if it reaches the tracker with
enough attached for whoever fixes it to start: which screen, which shell, which browser, and for
a defect the worker's own logs from the minutes around it.

The worker must not be the thing that talks to the tracker. Opening an issue from a request
handler would put a tracker token in the worker's secrets, couple a foyer tap to a third party's
availability, and hand a bug report's investigation to code that cannot read logs. Reading the
worker's logs and deciding what an issue should say is a job for a run with a person's tooling
and a person's judgement behind it, on a schedule, not a job for the request that took the tap.

## Decision

The application only records. `POST /api/feedback` writes one `feedback_reports` row (kind,
words, page path, shell, user agent, the browser's recent failures) and one `feedback.submitted`
audit entry in a single batch, rate-limited per reporter like every other write that takes free
text. The button sits in the `console` and `tonight` shells only: a signed-out visitor, a member
on their own pages and a reader of the documentation are not the audience.

A scheduled daily run outside the worker, whose instructions are versioned at
`.claude/skills/triage-feedback/SKILL.md`, reads the table through the account's database
connector, opens one tracker issue per `NEW` row (a bug with the worker's logs around the
report, an idea with the original words and a first plan), and writes the outcome back with a
conditional statement on `status = 'NEW'`, so two runs overlapping cannot open two issues for
one report. It never edits code, never opens a pull request and never touches another table.

## Consequences

- `feedback_reports` is mutable (`status`, `issue_url`, `triaged_at`) and so is not one of the
  append-only tables 0010 protects. A row's words are personal data: erasure scrubs them and the
  browser details and leaves the row (0011, K-109).
- The triage run's writes are not in the audit trail: it is not an actor in the application and
  holds no session. What it did is on the row (`issue_url`, `triaged_at`) and in the tracker.
  `docs/known-issues.md` names this.
- The run's credentials are the account's connectors and live nowhere in this repository. If the
  account's database connector or tracker connector is withdrawn, reports still arrive and wait;
  nothing is lost, and the queue is readable in the database until the run is restored.
- No immediate notification is sent. A defect that takes the theatre down is `health:watch`'s
  job (J-106); a defect somebody can work around waits a day. If that proves too slow the
  notification is one more `notify()` call, not a change to this shape.
- The reporter sees a thank-you and nothing more. A "your reports" list was considered and
  deferred: the tracker is where the outcome lives, and the IT Manager tells people.

## Options considered

- **Open the issue from the request handler.** Rejected: a tracker token in the worker, a
  foreign dependency on a show-night tap, and no way to gather logs at that moment.
- **A scheduled workflow in the repository's own CI.** Rejected for now: it needs an API key
  and a database token stored as repository secrets, a second place to mirror them, and an
  environment that has to be built before it can read a log. A run driven from the account that
  already holds the connectors has none of that to maintain.
- **A triage endpoint with a machine token.** Rejected: one more secret to keep in three places
  for a table whose only writer besides the application is one scheduled reader.
