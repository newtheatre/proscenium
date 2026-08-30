# 0031: A membership is a term, and confirming it never gates money

- Status: Accepted (committee direction, 30 August 2026)
- Date: 2026-08-30

## Context

A-117 and the `memberships` table both described membership as a yearly state: one row per person
per committee year, lapsing on 31 July with everything else (0009, 0014). Nothing had ever written
a row, so nothing had tested the assumption.

It is wrong. Membership is bought at the Students' Union for a term of **one or three years running
from the purchase**, so two people who joined a month apart lapse a month apart, and a three-year
membership spans three committee years without renewing. A year-shaped table cannot hold that
without inventing boundaries the purchase does not have.

Two more things follow from where membership actually lives. The SU sells it, so this system learns
about it second-hand and the committee checks it against the SU's own list afterwards. And the
check is by **student number**: a member's name may not match the SU's record, and the address they
give us is often personal rather than university.

## Decision

**A membership is a term.** `starts_on` and `expires_on` are London dates; the term is how a grant
is entered, not what is stored, so a term the SU invents later needs no migration. Current means
today falls inside the term or the grace window after it, read at query time, so a membership that
ran out overnight stops counting without a sweep having to run (0009).

**A grace window, because a renewal in hand should not be a refusal at a desk.**
`MEMBERSHIP_GRACE_DAYS` proposes fourteen.

**Confirmation never gates money.** A membership counts from the moment it is recorded. The
committee confirms it against the SU's list afterwards, and `confirmed_at` records who did and
when. A person pays a member price on an unconfirmed membership, because the alternative is a
volunteer at a desk arguing with a member about paperwork neither of them controls.

What confirmation may gate is **participation**: training, proposals, the rota. Nothing consults it
yet, and nothing should until there is a module with a case to apply it to. This record fixes the
half that is settled and deliberately leaves the other half open.

**The student number lives on the account**, nullable and unique: one person, one number, whatever
they buy. It is how the committee finds somebody, and the reason it is the key rather than the name
matters. A member whose name has changed should not have to explain themselves to be recognised.

## Consequences

- `memberships` is rebuilt, which 0010 normally refuses. It is safe here for a reason that is in
  the migration: nothing references the table, so no cascade can lose rows, and no row had ever
  been written. A test writes rows under the old shape, applies the migration, and finds them.
- `users` gains a column, so three things move together: the tombstone guard names it, erasure nulls
  it, and the personal-data registry lists it. That the registry makes this visible is the point of
  having one.
- **Renewal reminders become sensible.** Each membership has its own expiry, so a reminder is one
  message on one date rather than a year-end chase at everybody. It carries no topic because it is
  about a thing somebody bought, and it does not reach an unverified address, which is what keeps a
  sweep over ten thousand imported accounts from becoming a bulk send (A-102 criterion 2).
- A-201, the SU list import, gains its match key. It stays Phase V2.
- A membership does not need a person to be able to sign in: a guest account holds one. That is the
  opposite of a fellowship, which needs an account because the entitlement is a pass (0023).
