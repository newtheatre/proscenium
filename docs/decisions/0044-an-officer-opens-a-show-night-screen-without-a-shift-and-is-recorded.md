# 0044: An officer opens a show-night screen without a shift, and is recorded

- Status: Accepted
- Date: 2026-09-03

## Context

Operational authority derives from facts and is never granted in advance (0009). A show-night
screen therefore opens to tonight's confirmed shift: the door to a DOOR shift, the till to a BAR
shift, approvals and close-night to the confirmed duty manager (E-111 criterion 1). That is the
rule, and it is the right one: at 04:00 the authority is gone with nothing to revoke.

It is also not sufficient on its own. The rota is a plan made days earlier by volunteers, and at
19:20 it is sometimes wrong: the duty manager is ill, the bar shift was never filled, the person on
the door swapped with somebody who never claimed the slot. The old estate answered this by letting
the front of house officer and the bar manager open the screens anyway. Module E's open question 5
asked whether that behaviour carries. It was answered on 3 September 2026 in `build-order.md`: it
carries, and every use is audited and flagged on the night report's staffing section. This record
is that answer, written where the argument lives.

The danger is that a bypass quietly becomes the ordinary way in. If nobody sees it, an officer role
is a standing operational grant wearing a different name, which is exactly what 0009 refuses.

## Decision

**Show-night authority resolves in two ways, and the second one is recorded.**
`server/utils/night-authority.ts` owns both. `requireNightAuthority(event, role, scope?)` resolves
`{ account, night, role, venueId, performanceIds, via, shiftId? }`, where `via` is `SHIFT` or
`OFFICER`. A refusal is a 403 naming what would unlock it.

**Three permissions carry the bypass**: `night.door`, `night.till` and `night.manage`. They are the
one named exception to "standing permissions are administrative only", and the exception is stated
at the permissions themselves. `FOH_MANAGER` holds `night.door` and `night.manage`; `BAR_MANAGER`
holds `night.till`; `ADMIN` holds everything. A door shift still does not open the till, and
neither does the front of house officer's role (E-111 criterion 1, F-101 criterion 2).

**The bypass is tonight's, not a standing one.** It derives its night from `showNightOf` through
`currentShowNight()` and covers no other night, so a request for a night that has ended is refused
whatever the caller holds. There is no second boundary anywhere in the resolution (0014, E-110).

**Every officer resolution writes `night.officer-bypass`, once per account per night per venue per
role.** The key carries the venue because two venues may run on one night; without it an officer
covering both would be recorded once and the second venue's night report would look clean. It does
not carry the performance, because a matinee and an evening at one venue are one evening's work.
The row's detail carries every performance the venue runs that night, so the record still keys to
performances (E-127 criterion 1) even though the key does not.

**"Once" is held by the database.** A partial unique index on `audit_log (actor_id, target)` where
the action is `night.officer-bypass` refuses the second row, and the write is an insert that
tolerates the conflict. Two simultaneous first requests therefore write one row between them,
rather than one each.

**The officer branch carries the second-factor gate its role carries elsewhere.** It is a standing
grant being used, so `PRIVILEGED_ROLES` applies to it exactly as it applies to `requirePermission`
(A-112). A shift will not carry that gate when the shift branch lands, because a shift is not a
grant.

**Hiding a link is never the enforcement.** The three abilities in `shared/utils/abilities.ts` are
named views over these permissions and decide what the chrome shows; the guard on the route is what
refuses (E-111 criterion 5, restated in 0040).

## Consequences

- `roles.ts` gains its first non-administrative permissions, and the comment above them says so and
  cites this record. A reader who finds a fourth `night.*` permission without a record has found a
  defect.
- `BAR_MANAGER` is a new role. Nothing in the old estate grants it, so the import cannot reach it
  and `tests/unit/roles.test.ts` names it as the one role with no import source. The bar was run on
  paper and a card reader; there is no old row to map.
- The night report's staffing section reads `night.officer-bypass` for the night it compiles
  (E-123 criterion 1). One row per venue per role is what it will find, and it must say which venue.
- The shift branch arrives in show night wave 3 and fills a case: it resolves a confirmed shift
  before the officer check and returns `via: 'SHIFT'` with `shiftId`. The signature does not change,
  and no consumer written against the officer branch is touched.
- Until that branch lands, the three abilities read the officer permission only, so a member holding
  a shift and no officer role sees no link. Nobody is in that state yet, because `shifts` does not
  exist. Wave 3 widens the viewer, which is where `onShiftTonight` becomes the night roles held.
- An officer who bypasses at two venues on one night is two rows, and an officer who opens the door
  screen at 18:00 and again at 21:00 is one. The second request is not refused; it simply records
  nothing new.
- Whether `BAR_MANAGER` belongs in `PRIVILEGED_ROLES` is a workshop question, not this record's:
  the till takes money, which 0009 says demands a second factor, and forcing an unenrolled bar
  manager to enrol at 19:25 is its own failure. The default is unchanged here.

## Options considered

- **No bypass: a shift or nothing.** Rejected. It is the purest reading of 0009 and it stops the
  night when the rota is wrong, which is the evening the system most needs to work. The committee
  answered this on 3 September.
- **A bypass with no record.** Rejected. An unobserved exception is a standing grant, and the night
  report is where the committee finds out that the rota is not being kept.
- **Keying the record per account, per night and per role, with no venue.** Rejected. It is what
  `build-order.md` proposed, and it hides the second venue on a two-venue night.
- **Keying it per performance.** Rejected. An officer covering a matinee and an evening at one venue
  did one evening's work, and three rows for it would read as three failures of the rota.
- **A self-service claim: the officer takes tonight's shift and then holds it.** Rejected as this
  contract's answer, because it needs `shifts`, which does not exist. E-107 already lets the officer
  assign a shift, and that is the better fix when there is time to make it.
