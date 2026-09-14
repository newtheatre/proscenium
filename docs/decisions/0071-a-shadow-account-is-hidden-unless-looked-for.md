# 0071: A shadow account is hidden from the directory unless looked for

- Status: Accepted
- Date: 2026-09-14

## Context

Three things make an account nobody registered. The console makes one when an administrator
adds somebody and sends a set-password link (A-121 criterion 3). The box office makes one for a
ticket guest who gave a name and an address and nothing else. The import brought over every
person the old estate knew, most of whom only ever bought a ticket. None of these accounts holds
a password, a Google link or a passkey: there is no way to sign into them, and there never was.

The directory (`/people/accounts`) treated every one as an ordinary row, and marked each one
Unverified, because nothing had verified its address. After the import that was most of the
listing: well over a thousand rows in a warning badge, drowning the few dozen accounts the IT
Manager actually triages, and the badge was wrong. Unverified means a real registration whose
address is unproven (0026); these were never registrations. 0026 already exempts them from the
unverified expiry sweep under the name "shadow account", but nothing else in the system knew the
name.

## Decision

**An account with no sign-in method is a shadow account: `password IS NULL`, `google_sub IS NULL`
and no row in `passkeys`.** The predicate lives once, as `isShadow()` in
`server/utils/directory.ts`, and is what the listing, the detail view and the filter all answer
from. It is not a column: a set password, a Google link or a passkey ends the state the moment
it is written, with nothing to keep in step (0009 makes the same argument for roles).

**A shadow account is hidden from the directory unless looked for, exactly the way an anonymised
row is (A-121 criterion 4).** Looking for one means any of: a non-empty search string, a `shadow`
condition, a `neverSignedIn` condition, or the `includeShadow` flag on the query. A search
shows them because somebody typing an address wants that address, whoever holds it; the
`PersonPicker` always searches, so a guest can still be chosen as the holder of a booking or a
pass. Any other filter hides them, so that "role holders" or "unverified addresses" answer the
question asked rather than that question plus the import.

**Hidden is not lost.** The listing's total line says how many shadow accounts the default
filter left out, with an affordance that sets the `shadow` filter, so the count is always one
click from the rows behind it. The endpoint carries it as `shadowHidden`, zero whenever nothing
was hidden.

**A shadow account is badged Shadow, never Unverified.** The badge is neutral: it describes what
the row is, not something that needs fixing. Unverified stays for a non-shadow account whose
address is unproven, which is the population 0026's sweep is for.

## Consequences

- A console-created account disappears from the bare listing the moment it is created and stays
  hidden until it is claimed, which is when the person sets a password (A-116). The screen
  searches for it rather than expecting it in the list, and the directory test says so.
- `shadow` is a declared field of `shared/utils/accounts-list.ts`, so its chip, its query key
  and its server binding come from one declaration (K-129, 0032), and the unit test that holds
  every column-less field to a binding covers it.
- `neverSignedIn` and `shadow` overlap but are not the same question. Never signed in also
  wants `last_login_at` NULL, and a shadow account is one whether or not somebody once signed
  into it before every method was removed; the removal path refuses that (A-113 criterion 1), so
  in practice the two differ only by a passkey-only account, which is why either one unhides.
- The hidden count is a second `count()` over the same predicate, run only when something was
  hidden. The banners already cost one statement per page load; this is one more, on the
  accounts page alone.
