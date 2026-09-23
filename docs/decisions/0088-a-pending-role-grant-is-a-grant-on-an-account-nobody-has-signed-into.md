# 0088: A pending role grant is a grant on an account nobody has signed into yet

- Status: Proposed
- Date: 2026-09-23

## Context

At handover the IT Manager grants the incoming committee its roles, and several of them have
never signed in: there is no account for the person picker to find, so A-131's register cannot
grant them anything (issue 1212). K-123 criterion 1 and 0032 say a person is chosen, never
typed, and that rule has to hold for everybody who does have an account. The console's Add
someone dialogue (A-121 criterion 3) already makes an account with no way in and can grant it a
role, and A-116 already turns such an account into a real one: registering with its address
sends a set-password claim link, Google sign-in with a matching Workspace address claims it
(A-104 criterion 2), and a magic link signs into it. What nothing does is say that such a grant
is not yet held by anybody, so the register counted it as a live holder and the last-IT-Manager
guard (A-120) would have been satisfied by a person who cannot sign in.

## Decision

**A pending grant is an ordinary `role_grants` row whose account is a shadow account (0071)
that has never signed in: no password, no Google link, no passkey and `last_login_at` NULL.**
It is a predicate read at query time, like live and lapsed (0009), and never a column or a
second table. It stops being pending the moment the account gains a way in or first signs in,
which is A-116's claim doing what it already does; there is no second claim step to write,
race or forget.

**Granting by email is the register's fallback when the picker finds nobody.** The grant route
takes an address and a name in place of an account id, and only when no account holds that
address; an address that has one is refused with the instruction to choose it, so the picker
rule is unchanged for every existing account. An address some account is pre-linked to for
Google (`pending_google_email`) is refused the same way, because that account is who the address
signs in as. The shadow account, its grant and both audit
entries are one batch, and the unique address on `users` is the conditional write: of two
administrators granting the same address at once, exactly one account and one grant exist
afterwards and the other is refused with the same instruction. It needs `accounts.create` as
well as `roles.grant`, because it makes an account.

**A pending grant carries the same expiry as any other.** The committee year end by default, a
picked date or permanent (0009, A-118 criterion 1): a pending grant nobody claimed lapses on
31 July like the rest.

**Pending is not holding.** The register lists pending grants apart from its holders and never
counts them in a live total; the last-IT-Manager guard does not count a pending IT Manager as
usable (A-120 criterion 3). Revoking a pending grant is the ordinary revoke.

**A Workspace address is claimed by Google alone (0008).** Nothing new is needed: the CHECK on
`users` refuses a password on a Workspace address, and registration, the forgotten-password
form and the magic-link request all refuse one before anything is sent. So no set-password link
is issued for a Workspace address; a personal address gets the same set-password link the
console's Add someone sends.

## Consequences

- `role_grants` is unchanged and stays a mutable table: grants are renewed in place and revoked
  by deletion (A-131 criterion 5), and the audit trail is the history. No migration.
- The audit entries are the existing `account.created.console` and `role.granted`, the latter
  with `pending: true`; the address is on the account row, never in the detail (0011).
- An imported shadow account that holds a carried grant and has never signed in now reads as
  pending rather than as a holder. That is the truth about it: nobody can use that grant until
  the person claims the account.
- Revoking a pending grant leaves the shadow account behind, as the console's Add someone
  does; it is hidden from the directory (0071) and swept like any other shadow account.
- An address that is some account's `pending_google_email` is refused as well. The import
  carries that pre-link across (`migration/identity.ts`), and Google sign-in resolves it before
  an address match (A-104 criterion 2), so a shadow account made for the same address would hold
  a grant its person never signs into. The route checks it up front, naming the account to
  choose, and the batch repeats it as the predicate on the account's insert, so a pre-link
  landing in between still leaves nothing written.
- This does not give an administrator a way to set a pre-link (issue 1061). That flow is for an
  incoming officer who already has an account under a personal address and must gain a
  Workspace link on it; the picker finds them, so the email fallback never applies. It only
  keeps the fallback from colliding with a pre-link that already exists.

## Options considered

- **A `pending_role_grants` table, claimed into `role_grants` on first sign-in.** It would be
  append-friendly, but every way onto an account (the set-password claim, Google by email,
  Google by pre-link, the magic link, a merge, erasure) would need a second conditional write
  to move the row, each one a place to forget. The shadow account already is the pending state,
  and A-116 already claims it.
- **Letting the picker take a typed address for anybody.** Reopens K-123 criterion 1, and a
  typo would make a second account for somebody who already has one.
