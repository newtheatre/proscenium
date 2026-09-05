# 0050: An access profile's special category payload is one encrypted blob

- Status: Accepted
- Date: 2026-09-05

## Context

D-127 gives a patron a self-declared access profile: nine need flags, a companion entitlement, an
optional note, an evidence reference and an officer's agreed door wording. `data-model.md` had
sketched these as individual columns on `access_profiles`, alongside a table-level note that the
row is special category data, "encrypted at rest".

Those two statements cannot both be read literally. D1 is SQLite: it has no column-level
encryption, no transparent data encryption, and no way to run a `CHECK` or an equality filter
against ciphertext. Encrypting nine boolean columns individually would still have to decrypt all
nine together on every read, since the flags are never meaningful apart, so column-level
ciphertext would buy nothing a single ciphertext does not, and it would cost nine nonces instead
of one.

This is the first table in the estate holding a field that must be stored and later read back in
the clear rather than hashed: `totp_secrets`, `tokens.ts` and `mfa.ts` all use Web Crypto, but only
for HMAC and SHA-256, one-way operations that never need to come back. Access profiles need the
opposite: the door and the officer's own screen must read the real answer.

## Decision

**The special-category payload is one JSON object, encrypted with AES-256-GCM and stored as two
columns: `encrypted_payload` (ciphertext) and `encryption_iv` (a fresh nonce every write).** The
payload carries the nine flags, the requester's own note, the officer's agreed wording, and the
self-declared evidence reference, exactly the fields nobody but the account's owner or a verifying
accessibility officer may ever read. `status` and `companions` stay plain columns, because the
database enforces them directly: `companions BETWEEN 0 AND 2` is a `CHECK` a ciphertext blob could
never satisfy, and D-127 criterion 1 asks for the cap to be a database guarantee, not an
application one.

The key is a worker secret, `NUXT_ACCESS_PROFILE_ENCRYPTION_KEY`, read through `runtimeConfig`
rather than the account Secrets Store: nothing outside this application ever needs to decrypt this
column, so it is not a secret shared across workers the way `NUXT_SESSION_PASSWORD` is. Rotating it
makes every stored profile unreadable, the same one-way consequence rotating the session password
has for sessions, and is flagged the same way (estate `CLAUDE.md`, "Flag any change that would
require it").

The evidence reference (an Access Card number, self-declared) lives inside the same payload rather
than its own column. D-127 criterion 1 says evidence is sighted at verification and never stored:
`verifyAccessProfile` and `declineAccessProfile` both clear it from the payload the moment the
officer has looked, whichever way the decision goes, so nothing survives the review that is not
already the agreed wording.

The account id is bound into every encryption as AES-GCM's associated data, authenticated but not
encrypted. GCM alone proves a ciphertext was not tampered with; it says nothing about which row it
belongs to, so a ciphertext copied from one account's row onto another's (a migration slip, a bad
script) would otherwise decrypt cleanly as the wrong person's answers. Binding the id makes that
refuse instead.

## Consequences

- `shared/utils/access-profile-crypto.ts` holds the pure AES-GCM primitives, taking an imported
  key rather than reading configuration; `server/utils/access-profile-crypto.ts` is the one place
  that reads the worker secret and calls through to them. Every read and write of the payload
  goes through this pair.
- `export-bundle.ts` cannot use its generic column select for this one table: it decrypts
  `encrypted_payload` before handing the person their own subject access export, which is the one
  export this table appears in (D-127 criterion 4). Every other table in `PERSONAL_TABLES` needs
  nothing extra, which is what keeps the registry generic for the other forty-odd rows in it.
- A verified profile's expiry is enforced at read time, the same rule 0009 gives role grants:
  `effectiveStatus()` reports `EXPIRED` once `expires_at` has passed without a sweep having to
  write the status column first.
- `docs/data-model.md`'s access_profiles entry is corrected to describe the two-column payload
  shape rather than nine named columns; the nine flags remain the domain vocabulary, just carried
  inside the payload rather than as SQL columns.

## Options considered

- **Nine plain boolean columns, encrypted individually.** Rejected for the reasons above: no
  column-level encryption exists in D1, the flags are read and written together, and nine nonces
  buy nothing over one.
- **Leave the payload in the clear and rely on access control alone.** Rejected outright: the story
  states plainly that this is special category data and must be encrypted at rest, and access
  control (`access.verify`, ownership) is a second, independent control, not a substitute for the
  first.
- **A Secrets Store binding, like `NUXT_SESSION_PASSWORD`.** Rejected: the store exists for
  secrets shared across the estate's four workers. This key is read by nothing outside this
  application, so a worker secret is the narrower, correct scope, and it avoids adding a fifth
  binding to a store built for cross-worker sharing.
