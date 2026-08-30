# 0028: A manual audit entry names people by account, and is signed

- Status: Accepted
- Date: 2026-08-29

## Context

J-103 asks for entries recording actions taken outside the system: a role agreed at a committee
meeting, an account barred by a decision nobody typed into anything. The story wants each one
signed, carrying "the stated real-world actor" as a structured field.

That collides with 0011, which keeps personal free text out of audit detail so erasure never has to
reach the trail's content. A name is personal free text. `guardDetail` would refuse an address and
would accept "Jane Smith", which is worse: it would sit in the trail permanently, past that
person's own erasure, in a table whose only sanctioned edit is redaction.

## Decision

**A manual entry names people by account reference only.** `onBehalfOf` must resolve to a user id
on this system, and is recorded as `user:<id>`. So is the target. Nothing in a manual entry names a
person any other way.

The cost is stated rather than discovered: **a person with no account cannot be named.** An SU duty
manager, a visiting company, a contractor: the entry records the officer who signed it and the
account it is about, and the person outside the system is not in the trail at all. A closed
vocabulary of external roles was considered and refused for now, because inventing one before a
module needs it is guessing.

**The namespace is enforced at the write path.** Only an action carrying `manual: true` in the
catalogue may be written by hand, and every one of them is named `manual.*` (0027). A manual entry
can never claim an action the system performs, in the trail or in any report that groups by action.

**The signature is the row's `actor_id`,** which is the officer who entered it. That is the
authoritative record: `actor_id` can never be rewritten, while detail can be redacted, so
duplicating the signer into detail would create a field that erasure could remove from an entry
that still has to say who signed it.

**Signing requires a second factor as a fact, not as a role.** A-112 already refuses a privileged
role to an account with no confirmed factor, and every role holding `audit.write` is privileged
today. `PRIVILEGED_ROLES` is configuration, so the manual endpoint checks the factor itself: the
requirement belongs to the act of signing, not to a setting somebody may change. Resolving it from
the account's factors rather than from the cookie keeps 0009 intact, and every sign-in path
challenges an account that holds a factor, the magic link included.

**Taking a copy of the trail is an act on the trail.** The CSV export writes an `audit.exported`
entry naming the filter and the row count, so who read what, and when, is on the record too.

## Consequences

- The manual vocabulary starts at four actions, the manual counterparts of what the system can
  already do to a role and to an account. It grows with the modules, through the catalogue, like
  every other action.
- `audit.write` is a new permission. `MANAGER` and `THEATRE_MANAGER` hold it alongside `audit.read`,
  because J-103's story is the Theatre Manager's.
- The export is capped at 5000 rows and says in its own audit entry when it hit the cap. That is a
  technical bound and not a policy number, so it is a constant rather than a setting (0012).
- An entry recorded for somebody outside the system will read as the officer's act on the account
  it concerns. Where that loses something a committee needs, the answer is the closed vocabulary of
  external roles, and it needs a story rather than an improvisation.
