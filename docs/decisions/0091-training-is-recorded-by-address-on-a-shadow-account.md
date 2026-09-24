# 0091: Training is recorded by address on a shadow account, as a pending grant is

- Status: Accepted, 24 September 2026 (IT Manager)
- Date: 2026-09-24

## Context

The records screen signs a module off, or records an outside certificate, for a person chosen
with the picker, and the person has to have an account for the picker to find (issue 1262). The
people a Training Manager most often needs to record are the ones who have not signed in yet: a
fresher who did the ladder course at a get-in, a visiting technician with a first aid
certificate. `training_records.user_id` is NOT NULL and the table is append-only (0010), so a
record cannot wait keyed to an address and be moved onto an account later. 0088 has already
answered the same shape for a role: a shadow account made by address when the picker finds
nobody, claimed by A-116's own mechanism. The register's walk-in already mints such an account
for a trainer (G-117 criterion 2), but through a separate lookup, not in the batch that awards.

## Decision

**A sign-off or an external certificate may name an address and a name in place of an account,
only when no account holds that address.** The route makes a shadow account (0071) and writes the
record against it, with both audit entries, in one batch. Everything else about the record is
unchanged: the same department scope, award date, prerequisite, expiry and evidence rules, and
the same `record.signed-off` or `record.external-certificate` entry, which carries identifiers
only and adds `byAddress: true` (0011). The account's entry is the existing
`account.created.console`.

**The picker stays the way to anybody who has an account.** An address an account already holds
is refused with the instruction to choose that account, and so is an address an account is
pre-linked to for Google (`pending_google_email`, A-104), exactly as 0088 refuses them. The
route checks both up front; the unique address on `users` is the conditional write between two
people recording the same address at once, and the pre-link refusal rides the account insert's
own predicate, with every later statement guarded on that insert having happened (0003).

**Making the account is a narrow standing of its own, not `accounts.create`.** The permission
`training.by-address` lets its holder make an account only as the subject of a record in the
same batch, and nowhere else. The Training Manager holds it (the IT Manager holds every
permission). A department lead holds no role, so a live lead of the module's own department is
admitted by derivation, read at the request like every other training standing (0009, 0037).
A trainer's walk-in keeps its own path (G-117).

**Nothing is sent.** Unlike a pending grant, a training record gives nobody access that is
waiting on them, so the address receives no set-password link. The record simply appears when
the person registers with the address (the A-116 claim link), signs in with Google as that
Workspace address, or uses a magic link. A Workspace address is still claimable by Google alone,
because the CHECK on `users` refuses it a password (0008).

## Consequences

- No migration: `training_records` and `users` are unchanged, and the record is keyed to a
  person from the moment it is written, as every other record is.
- Retention and erasure are ordinary (0011). The shadow account is swept or anonymised like any
  other, and the evidence reference clears through the existing guard.
- A shadow account made this way is hidden from the directory's default listing (0071) but is
  found by a search, so the next record for the same person is made by choosing them.
- A prerequisite is checked against what the new account holds, which is nothing, so a module
  with prerequisites cannot be the first thing recorded by address; the prerequisite is recorded
  first and the rest against the account it made.
- A department lead holds no `accounts.read`, so the records screen's picker could not search
  for them, and the address fallback behind it never appeared. The picker asks a training route
  instead, which answers an id and a name and nothing more, to whoever may award a record.
- The register's walk-in lookup (`attendees/lookup`) refuses a pre-linked address with the same
  check, up front. Its account insert does not yet carry the predicate, so a pre-link landing
  between the check and the write is not caught there.

## Options considered

- **A pending-records table keyed by address, moved onto the account at claim.** Refused for the
  reasons 0088 gives for pending grants, and more strongly: the moved rows would be append-only
  records, which may not be rewritten (0010).
- **Giving the Training Manager `accounts.create`.** It would open the console's Add someone and
  the account page's pre-link to them, which is far wider than recording what somebody was taught.
