# 0012: Policy is configuration, enforced at the write path

- Status: Accepted
- Date: 2026-08-26

## Context

The audit's sharpest finding was the rooms application publishing a policy document (duration
caps, notice periods, booking limits, a no-show ladder) that no code enforced. The published
product and the real product had diverged completely, and members learned the real rules by
trying things.

## Decision

Every operational rule with a number in it is a validated configuration key with a shipped
default, enforced at the API write path: booking windows and caps, hold expiry, refund policy,
comp authority, tab caps, training warning windows, nag cadences. The settings surface shows
each key's default, current value and last editor; wide-blast-radius changes require an
affected-count preview and typed confirmation; every change is audited and revertible in one
action. The workshops register is the initial value set; a value nobody confirms ships as its
proposed default.

## Mechanism (amended 26 August at committee direction)

Policy pages are authored as markdown documents in Nuxt Content, written and edited like any
other content page, with placeholder tokens in the prose (for example `{{ROOM_MAX_HOURS}}` or
`{{HOLD_RELEASE_MINUTES}}`). At render, each token resolves to the live value of the named
configuration key, so the sentence "bookings run to a maximum of 4 hours" is always quoting
the setting that the write path actually enforces. A token naming an unknown or renamed key
is a loud failure, not a blank: CI validates every token in `content/` against the
configuration schema, and at runtime an unresolved token renders as a visible error, never as
stale or missing text.

## Consequences

- The published policy page is generated from live configuration, so it cannot drift; editing
  the prose and changing a number are separate acts with separate owners.
- Committee rule changes are settings changes, not releases, and the policy page updates the
  moment the setting does.
- A rule the committee wants but the system cannot enforce yet is recorded as unenforced on
  the generated page, which is the honest state the old estate never had.
