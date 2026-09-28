# 0107: The committee is a content data file, quoted by token, and flagged stale after the handover

- Status: Proposed
- Date: 2026-09-28
- Amends: 0012 (a second token namespace beside the configuration keys)

## Context

The about page lists the committee, and other public pages want to name a particular officer:
the technical page's "our Technical Manager, whoever that is this year". Written into each page's
prose, a name goes stale in as many places as it is quoted, and the committee turns over every
year (roles lapse on 31 July, 0009). The roles themselves are the constitution's, not the
application's: `role_grants` holds the system's own permission vocabulary, provisional until the
role workshop, and says nothing about who a visitor should write to. Nobody records when the
public list was last checked, so a list two committees old reads exactly as confidently as a
current one.

## Decision

**The committee is one YAML file, `content/committee.yml`, read as a Nuxt Content data
collection.** It carries `updatedOn` (an ISO date, set by whoever edits it, as the docs
collection's pages do) and one entry per role in the constitution's order: a `key` in
upper snake case, the role's `title`, an optional role `email`, and `holders`, a list of names
that is empty until the committee supplies them. The file is edited by editing and merging, the
same interim pipeline 0051 set for every editorial page.

**A page quotes it by token: `{{COMMITTEE_<KEY>_NAME}}` and `{{COMMITTEE_<KEY>_EMAIL}}`.** The
`COMMITTEE_` prefix is its own namespace beside the configuration keys (0012), resolved from the
data file rather than the settings, and `bun run check` refuses a committee token whose role or
field the file does not have, exactly as it refuses an unknown setting. A name renders as the
holders joined with "and", or as `[name goes here]` while none is supplied. An email renders as a
mail link; a role with no address is an unset address under J-110 criterion 6, so the paragraph
or list item quoting it is left out whole. The about page's table is a content component,
`::committee-table`, drawn from the same file.

**A page that quotes the committee says when the list may be out of date.** The committee year
starts on 1 August (0009); from 1 September, a month's grace for the handover, a page that
quotes the file carries "This content may be out of date" if `updatedOn` falls before that
1 August. The table always states the date it was last updated. The test is on the London date
(0014), and the page renders per request, so the warning appears without a deploy.

## Consequences

- One edit a year updates every page that names an officer, and a missed handover announces
  itself on the public site rather than going unnoticed.
- `updatedOn` is a human's claim, not a commit time: an edit that forgets to move it leaves the
  warning showing. Deriving it from git was rejected: the page reads the content database at
  runtime, which carries no commit history, and a formatting-only commit would reset the clock.
- Names on a public page are personal data (0011). They are here because each holder stood for a
  public office whose holder the society publishes, and the file carries names and role
  addresses only; a personal address never belongs in it.
- Committee tokens are not settings: nothing enforces them, so they never render the "applied by
  hand" marker, and the configuration endpoint never answers for them.

## Options considered

- **Read the committee from `role_grants`.** Rejected: the system's roles are a permission
  vocabulary, not the constitution's offices, and publishing them would publish every grant
  holder's name without a consent step.
- **Keep the names in each page's prose.** Rejected: that is the drift this record exists to
  stop.
- **Configuration keys per officer.** Rejected: a list of people is not a policy number, and the
  settings surface marks names sensitive precisely so that no public page quotes them.
