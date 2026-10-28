# 0257: An account is granted several roles at once

- Status: Proposed
- Date: 2026-10-25
- Amends: A-118 (criterion 8 added)

## Context

At handover an incoming officer often needs two or three roles: a Front of House Manager who is
also the Bar Manager, a President who also reads the money. The account page grants one role per
submission, so each needs the same expiry and the same note typed again, and a slip leaves them
with different end dates. The admin UX audit of 24 October 2026 proposed one grant for several
roles.

## Decision

1. **The account page's grant form chooses several roles**, with one **Until** and one **Note**
   for all of them. The register, which fixes the role and picks the person, still grants one.
2. **`POST /api/admin/roles` takes `roles`** in place of `role` for a chosen account. A grant by
   address takes one role, since it makes the account: the rest follow once it exists.
3. **Each role is still its own grant row and its own audit entry**, `role.granted` or
   `role.renewed` exactly as one grant writes them, so the register, the lapse warnings and the
   trail read nothing new. All of them go in one `db.batch`, behind the IT Manager guard when the
   IT Manager's role is among them (0035), so the grant is every role or none.
4. **The account's current grants are read by its own key**, the whole set, never an `IN` list of
   the roles asked for (0006). A role named twice is refused, and the self-grant rule (0114) is
   applied to each role.
5. **The answer names each role** with whether it renewed and whether it waits on an
   authenticator (A-112), and the form names every role that waits.

## Consequences

- A handover is one submission per person, with one expiry to get right.
- A single `role` still answers as before, so the register and every caller of the old shape are
  unchanged.
