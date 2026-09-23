# 0090: The Box Office Manager is the Front of House Manager, and holds one role

- Status: Accepted (IT Manager, 23 September 2026)
- Date: 2026-09-23

## Context

The role vocabulary carried `BOX_OFFICE` (the programme's configuration: `ticketing.read`,
`ticketing.write`, `ticketing.export`) and `FOH_MANAGER` (the rota, checklists, the emergency
card, the board's presets, the Challenge 25 export, cross-season reports, and 0044's night bypass
through `night.door` and `night.manage`) as two standing grants. On the committee they are one
post: whoever is the Front of House Manager also runs the box office. Keeping two grants meant the
IT Manager made two grants at every handover and kept them in step by habit, and `/people/roles`
counted one person twice under two names (issue #1211, A-132).

Merging is not free. `ticketing.write` reaches the desk, and the desk's refund route asks
tonight's duty manager to approve a paid refund (D-116 criterion 2), which `night.manage` answers
without a shift through 0044's bypass. So one grant now sets prices and, on a show night, approves
a paid refund for tonight's performance without a duty manager shift. The two were separate roles,
but no decision record argued for keeping them apart.

## Decision

**`BOX_OFFICE` is retired, and `FOH_MANAGER` holds the union.** `FOH_MANAGER` holds
`ticketing.read`, `ticketing.write` and `ticketing.export` alongside everything it already held,
including `night.door` and `night.manage`. `BOX_OFFICE` leaves `ROLES`, so no route can grant it,
and a stored grant naming it is ignored by `liveGrants` like any other unknown role. The role's
title stays "Front of House Manager", because that is the post's name. "Box Office Manager" names
the job only where a page describes the box office's work, and the operator pages say which role
does that work.

**The IT Manager accepts the trade-off.** Price-setting and refund approval without a shift are
now in one grant. The approval is still 0044's bypass: it covers tonight only, a privileged grant
needs a second factor to use it (A-112), and every use writes `night.officer-bypass` and is
flagged on the night report. Comp approval is not affected: `isDutyManagerOrTicketingManager`
reads `ticketing.manage` or a confirmed duty manager shift, and never `night.manage`, so the Front
of House Manager decides a comp only on a shift, as before.

**Existing grants move in one migration, and nobody loses access while it runs**
(`0116_the_box_office_role_folds_into_front_of_house`). `role_grants` is not an append-only
table: grants are renewed, revoked and pruned in place (A-118, A-119), so the migration updates
rows rather than superseding them, and 0010's refusal does not apply. D1 applies the file in one
transaction:

1. One `role.merged` audit row per `BOX_OFFICE` grant, written first so it records the grant as
   it stood. The detail carries the two role names and the resulting expiry; there is no actor
   and no free text (0011).
2. Where the holder also holds `FOH_MANAGER`, that grant takes the later of the two expiries, a
   permanent grant (`NULL`) beating any date. A changed expiry re-arms the lapse warning (A-119).
3. A `BOX_OFFICE` grant whose holder has no `FOH_MANAGER` grant is renamed in place, keeping its
   expiry, granter, date and note.
4. Whatever `BOX_OFFICE` rows are left have been folded into step 2 and are deleted.

**The import maps both old box office roles to `FOH_MANAGER`.** `migration/role-map.json` maps
`proscenium:BOX_OFFICE` and `ticketing:BOX_OFFICE` there. Somebody who held both old roles
collapses onto one grant with the widest expiry, which the identity transform already does. A
recorded decision naming `BOX_OFFICE` from an earlier review is now an exception and is not
imported, so the review is run again for that grant rather than a guess being made (0070).

## Consequences

- There is no longer a desk role without the night bypass. Anybody given the desk by a standing
  grant also opens the door and the duty manager's screen without a shift. Desk crew who are not
  the Front of House Manager work the night from a shift.
- The blast-radius preview for `REFUND_PAID_REQUIRES_MANAGER` counts the holders of any role with
  `ticketing.write` and no `money.refund`, read from the permission map rather than a role named
  in the query, so it follows the map.
- `PRIVILEGED_ROLES` loses `BOX_OFFICE`. `FOH_MANAGER` was already in it. A stored `config` row
  that names `BOX_OFFICE` still validates and does nothing, because no grant carries that role.
- The migration's number may change at merge if another branch takes it first. Its content does
  not depend on its number.
- 0040's context line naming "Box Office" as a role is history and stays as written; the record
  carries a pointer to this one. 0044 stands unchanged, and it also carries a pointer, because the
  role holding its bypass now reaches the desk. 0009 and 0070 are unchanged.
- The other pairings the #1211 audit raised are not decided here.

## Options considered

- **Keep the two roles and grant both at handover.** This is what the vocabulary did. It relies on
  the IT Manager remembering both grants, and it counts one person twice.
- **Merge, but hold refund approval back from the bypass.** This would need a second night
  permission that only refunds read. 0044 keeps the bypass to three permissions, and the IT
  Manager preferred one role that matches the post.
- **Rebuild `role_grants` to rename the role.** A rebuild is never needed for a value change, and
  it risks the cascades 0063 describes. An in-place update in one transaction is enough.
