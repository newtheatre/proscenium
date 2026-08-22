# ADR-0014: Erasure is anonymisation, and an erased account is never resurrected

**Status:** Accepted · **Date:** 2026-08-14 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

Deletion is not available to anyone with booking history. `reservations.userId` is
`onDelete: 'restrict'`, and the sales record has to survive for reporting and for the treasurer's
accounts. Since the legacy import that describes almost every account in the database.

Erasure is also no longer this app's decision to make. Since stage-door Phase 7 (2026-08-12) it is
orchestrated centrally: `eraseUser` rewrites the auth identity, deletes credentials, tokens and
roles, bumps `session_epoch`, and then calls `POST /api/_hooks/auth/anonymise` on every registered
app, retrying until each succeeds.

That retry loop, and the shape of this app's session handling, impose two requirements that are not
obvious from the anonymisation code alone.

**The replacement values must match stage-door's byte for byte.** The local mirror is upserted *from
the session* by `ensureLocalUser`. Once the erased identity is read back from the auth service, a
locally-invented placeholder would be overwritten by the central one, leaving the two stores
disagreeing about the same person. Deriving the address from the user id rather than from random
bytes also makes the hook genuinely idempotent, which is what the retry loop assumes.

**An erased customer's own browser can undo the erasure.** This app cannot see `session_epoch`; it
learns of revocation only when a *role-holding* session goes stale after 15 minutes
([ADR-0008](0008-roles-go-stale-identity-does-not.md)). A customer holds no roles, so their sealed
cookie stays readable for the full 30-day `maxAge`, and `ensureLocalUser` runs on every request.
Without a guard, the erased person's next page load writes their real name and email straight back
over the scrubbed row, while `anonymisedAt` stays set, so the row remains hidden from listings and
the erasure looks done.

## Decision

**Anonymise in place, in one batch, and refuse to re-upsert an anonymised row.**

- Identifying details are replaced with values derived from the user id on the `.invalid` domain,
  which is reserved by RFC 2606 and therefore non-routable. These are byte-identical to what
  stage-door's `server/utils/erase.ts` writes.
- The whole scrub is a single batch. A half-applied anonymisation would leave the name cleared but
  the notes intact, or the reverse, with no record of which.
- **Both** note fields are cleared. The bulk retention sweep only cleared `customerNotes`, which is
  defensible for a sweep; this path runs because someone asked to be erased, and a staff note saying
  who collected the tickets identifies them as well as the name field did.
- `ensureLocalUser` refuses to write over a row with `anonymisedAt` set.
- Legacy imported rows use the same `.invalid` domain, so the `notAnonymised` filters match both
  shapes.

Calling `anonymiseUser` directly is not a fulfilled erasure request: it scrubs this app and leaves the
central identity intact. Central erasure is the supported route:
[docs/04-auth-and-permissions.md](../04-auth-and-permissions.md) §erasure.

## Consequences

- The booking stays; the person does not. Sales reporting is unaffected by erasure.
- A customer asking to remove their own account cannot be given a deletion. Anonymisation is the
  answer, and `DELETE /api/users/:id` says so rather than surfacing a foreign-key error.
- Account merge is the one path that does delete a mirror row, and does not bend this rule: the sales
  record survives intact on the winner's row. See stage-door ADR-0015.
