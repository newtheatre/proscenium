# 0255: An account says what its person can staff

- Status: Proposed
- Date: 2026-10-25
- Amends: A-121 criterion 5

## Context

"Why can Sam not take the bar shift?" is a question an officer answers several times a term. The
answer sits on three screens: the role on Accounts, the module on Training records, and the shift
on the rota board, where the assign dialogue says **Locked** and links nowhere. The admin UX audit
of 24 October 2026 proposed one place to read it and fix it.

## Decision

1. **The account page gains a Rota card**, read from `GET /api/admin/accounts/[id]/rota` under
   `rota.read`. For each shift role it says whether the person could be put on it now, and if not
   which of its facts is missing: the gating module held today, a committee role where the role
   needs one (0115), or a role nobody can take yet because its module is unset, a draft or not in
   the catalogue. The facts are the confirming write's own (`holdsGate`, `holdsCommitteeRole`), so
   the card and the write cannot disagree. A disabled account takes no shift.
2. **Each gap links to the screen that closes it**: Records with the person already chosen, the
   grant form on the same page, or Shift templates. A link shows only to a viewer who may open
   that screen (0040).
3. **The card lists their shifts and bar opening slots from tonight**, with the queries the
   member's own Rota reads, so both bound the list the same way.
4. **A Training card lists what they hold today**, renewals first, from the records route that
   Records already reads, under the same authority.
5. **Each card shows only to a viewer whose abilities already open the screen it summarises.**
   The page shows nobody anything they could not already read. The route reads one statement of
   at most four fixed tests (0006) and writes no audit row.

## Consequences

- A gap is found and closed from one page. The assign dialogue's **Locked** stays as it is.
- Records opens on `?person=<id>` for a viewer who holds `accounts.read`; anybody else, who could
  not have come from an account page, sees the picker empty as before.
- A new gate on a shift role must be added to `staffingStanding` beside the write, or the card
  will say a person can staff what the write refuses.
