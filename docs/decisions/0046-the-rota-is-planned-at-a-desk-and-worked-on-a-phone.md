# 0046: The rota is planned at a desk and worked on a phone

- Status: Accepted
- Date: 2026-09-03

## Context

0040 fixed nine console groups, each with a declared prefix, and settled that `/admin` means System
and nothing else. A domain with both audiences puts the member's pages at the top and the console's
under `manage`: `/rooms` against `/rooms/manage`, `/training` against `/training/manage`.

Show night did not fit. Its console group is called Tonight and its prefix was `/tonight`, but
`/tonight` is the phone-first shell, a plain dark subtree of big targets for somebody standing up in
a foyer. It is not a console prefix and never was. `build-order.md` had show night's screens at
`/admin/rota` and `/admin/templates`, written before 0040, and left the question open when 0040
landed. E-101, E-107 and E-113 all needed the answer.

The second half of the same question is who may open those screens. 0044 gave `FOH_MANAGER` the
three `night.*` permissions and nothing else, and `reachConsole` deliberately excludes them, so the
front of house officer could open the door screen on a Friday and could not reach the console at
all. E-101 criterion 2 says templates are editable by the FOH officer and administrators, and there
was no permission that let them.

## Decision

**`/rota` is the member's own shifts and `/rota/manage/**` is the administration of them.** It is
the `manage` convention 0040 already describes, applied to a domain show night already owns. There
is no tenth console group: the Tonight group's prefix becomes `/rota/manage` and its items are the
console screens, because a group's prefix is what the sidebar and the console middleware match on
and `/tonight` matches nothing in the console. The phone-first shell keeps `/tonight` and is
reached from the account menu, exactly as before.

E-113's venue emergency card goes under the same prefix, at
`/rota/manage/venues/[id]/emergency`. It is venue configuration rather than rota work, and the name
is a little odd, but it keeps show night as one console group rather than blurring it into Spaces.

**Administering the rota is a standing permission, and working tonight is not.** `rota.read` and
`rota.write` join the ordinary administrative permissions, held by `FOH_MANAGER` and `ADMIN`. A
template is written days ahead by somebody sitting down; nothing about it is tonight's, so 0009's
rule that operational authority derives from facts is untouched. `night.door`, `night.till` and
`night.manage` remain the one named exception, `OPERATIONAL_PERMISSIONS` still lists exactly those
three, and `reachConsole` still refuses somebody who holds only them.

A consequence worth stating plainly: `FOH_MANAGER` now reaches the console, because it holds a
permission that is not one of the three. That is the intended effect. An officer who plans the rota
has desk work to do, and the sidebar shows them the one group they can act in.

## Consequences

- `shared/utils/site-nav.ts`'s Tonight group carries `prefix: '/rota/manage'`. Its label and its
  position in the fixed order are unchanged, so 0040's nine groups stand.
- `tests/unit/roles.test.ts` no longer reads "an officer role carries the night bypass and nothing
  besides". It now names the bypass and the desk work separately, and asserts that
  `OPERATIONAL_PERMISSIONS` still has exactly three members, which is the property that mattered.
- A member's `/rota` page does not exist yet. It arrives with E-103's qualification-gated shift
  list, and `viewRota` gates only the console screen until then.
- E-107's release and reassignment screens, and E-101's templates, both sit under this prefix. A
  screen that turns up under `/admin` after this record is a defect.

## Options considered

- **A tenth console group, Show night, with its own prefix.** Rejected. 0040 fixed nine and gave a
  reason for the number: a fixed order is what makes the sidebar learnable, and a group appears
  when its module lands rather than when somebody adds one.
- **`/tonight/manage/**`.** Rejected. It reads as a subtree of the phone shell, and a screen put
  there by mistake would inherit the wrong layout expectations. Show night already owns `/rota`.
- **Gating the console screens on `night.manage`.** Rejected. It would make an operational
  permission open a console screen, which is precisely what 0044 stopped `reachConsole` doing, and
  it would give the bypass a second meaning.
- **Gating them on `ticketing.write`.** Rejected. The box office owns the programme; the front of
  house officer owns the rota, and they are different people in most committee years.
