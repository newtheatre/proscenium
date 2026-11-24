# 6. Settings and abilities

Rehearsals declares 15 settings, 7 abilities, no facts and one vocabulary. Every setting holds one value for the whole theatre and is changed on one page, Admin > Modules > Rehearsals; the two that vary by production (who sees the whole schedule, and default times) are columns on the schedule that fall back to the setting.

## Settings

All are changed by holders of `rehearsals.settings.manage`. Audience `members` means members' screens read the value; `staff` means only managers' and console screens do. None is public.

| Key | Kind | Default | Range | Group | Audience | Meaning |
| --- | --- | --- | --- | --- | --- | --- |
| `rehearsals.calls.default-start` | time | 19:00 | 00:00 to 23:55 | Calls | staff | Start of a new call, where the schedule does not say |
| `rehearsals.calls.default-length` | duration | 3h | 15m to 16h | Calls | staff | Length of a new call, where the schedule does not say |
| `rehearsals.calls.max-hours-a-day` | duration | 6h | 1h to 16h | Calls | staff | Rule W4's warning |
| `rehearsals.calls.latest-end` | time | 23:00 | 18:00 to 24:00 | Calls | staff | Rule W5's warning. Student halls and buildings often lock |
| `rehearsals.calls.ask-to-confirm` | boolean | false |  | Calls | members | Rule A2's nudge to people who have not marked a call seen |
| `rehearsals.drafts.expire-after` | duration | 7d | 1d to 90d | Calls | staff | A draft whose start passed this long ago is deleted |
| `rehearsals.schedule.team-sees` | choice | full | full, own | Who sees what | members | Rule V2, where the schedule does not say |
| `rehearsals.sheets.tell-uncalled` | boolean | false |  | Messages | members | Rule S3 |
| `rehearsals.changes.coalesce` | duration | 10m | 0m to 60m | Messages | staff | Rule N2: edits inside this window reach a person once |
| `rehearsals.changes.short-notice` | duration | 24h | 0m to 7d | Messages | members | Rule N3: changes this close are sent at once by email |
| `rehearsals.reminders.before` | duration | 3h | 0m to 2d | Messages | members | Rule N4. Zero sends none |
| `rehearsals.rooms.warn-before` | duration | 48h | 1h to 14d | Rooms | staff | Rule B6: a room still requested this close is flagged |
| `rehearsals.attendance.enabled` | boolean | false |  | Attendance and reports | staff | Rule A3 |
| `rehearsals.reports.send-to` | choice | team-without-cast | team, team-without-cast, leads | Attendance and reports | staff | Rule R2. Leads means Productions' lead positions only |
| `rehearsals.attendance.keep-for` | duration | 2y | 90d to 7y | Keeping data | staff | How long a person's call row (response and attendance) is kept after the call |

Changing a setting never rewrites a call. The defaults suit an evening-rehearsing student society and an amateur company alike, so the presets change none of them except as listed below.

## Record types

`rehearsals.schedule` (parent `core.production`), `rehearsals.call` (parent `rehearsals.schedule`), `rehearsals.report` (parent `rehearsals.call`). See part 4.

## Abilities

| Ability | Acts on | Risk | Owner | Implies | Purpose | Holders in the presets |
| --- | --- | --- | --- | --- | --- | --- |
| `rehearsals.schedule.read` | `rehearsals.schedule` | normal |  |  | See the production's published calls (shaped by rule V2) and sent reports. Not audited | Fact `productions.team-member` |
| `rehearsals.schedule.view` | `rehearsals.schedule` | normal |  | `schedule.read` | See drafts, private notes, the free view without reasons, attendance. Not audited | Fact `productions.team-lead`; `committee-member` (read-only oversight) |
| `rehearsals.schedule.manage` | `rehearsals.schedule` | normal |  | `schedule.view` | Make, change, publish and cancel calls; units; issue sheets; open and close the availability request; attendance; reports | Fact `productions.team-lead`; or a grant scoped to one production |
| `rehearsals.call-kind.manage` | site-wide | normal |  |  | Add, rename, retire call kinds and choose each one's room purpose | `administrator`, `technical-manager` |
| `rehearsals.overview.view` | site-wide | normal |  |  | Screen C2: every production's calls, without people's names. Not audited | `technical-manager`, `committee-member` |
| `rehearsals.settings.manage` | site-wide | privileged |  |  | Change the settings above | `administrator` (and `owner`, which holds everything) |
| `rehearsals.person-hours.read` | site-wide | privileged |  |  | Read each person's hours attended through core.person-measure (R3-27, RH-51). Audited as a read, with a purpose key | None directly; only Reports' person figures read it, for whoever holds Reports' own ability |

Notes:

- **Your own rows need no ability.** Seeing your own calls, responding, and your calendar entries are checked by ownership in the service, not by an ability, as Front of house does for a person's own shifts.
- **Scope.** Each ability on a schedule, call or report can be granted for one production, because each record's parent chain ends at `core.production`. A director who is not a Productions lead can still be given `schedule.manage` on one show.
- **Booking rooms is Spaces' check.** Making a call with a room also passes Spaces' own rules for the person booked for (its P1 and P2): `spaces.booking.request` on the bookable and, for the rehearsal purposes, core's fact `core.production-team`. Productions keeps a core credit for every current team member, so the second holds for the whole team.
- **No ability names a role.** The last column gives Identity's preset role keys or facts that hold it. A theatre maps its own.

## Facts

None declared. Rehearsals reads Productions' `productions.team-member` and `productions.team-lead`, and Spaces reads core's `core.production-team`.

## Vocabulary: call kinds

`rehearsals.call-kind`, a core vocabulary this module declares, with one extra field per term: `spacesPurpose`, the slug of the Spaces purpose its room booking uses. A theatre adds, renames and retires terms in C1.

| Term | Slug | Room purpose (Spaces' preset) | Notes |
| --- | --- | --- | --- |
| Rehearsal | `rehearsal` | Rehearsal (tier 3) | The default |
| Read-through | `read-through` | Rehearsal |  |
| Music call | `music` | Rehearsal |  |
| Movement or dance call | `movement` | Rehearsal |  |
| Fight call | `fight` | Rehearsal | Later: may carry a requirement (RH-46) |
| Costume fitting | `fitting` | Rehearsal | Often in the wardrobe, a place in words |
| Technical rehearsal | `technical` | Get-in, technical and dress (tier 2) | May ask to bump lower tiers, through an approver |
| Dress rehearsal | `dress` | Get-in, technical and dress |  |
| Photocall | `photocall` | Get-in, technical and dress |  |

If the purpose a kind names is missing or retired in Spaces, the health check fails and making a call of that kind with a room is refused with `rehearsals.room`.

## Presets

Rehearsals uses Spaces' three theatre types and Identity's preset roles, and adds none.

| Preset | Module on at setup | Who manages | Changed settings |
| --- | --- | --- | --- |
| `student-society` | Yes | Productions' leads (director, producer, stage manager) | `rehearsals.calls.latest-end` 22:30 |
| `amateur-company` | Yes | Productions' leads | `rehearsals.calls.default-start` 19:30, `rehearsals.attendance.enabled` true |
| `small-venue` | No (visiting companies rehearse elsewhere) | `administrator` and `technical-manager` when switched on | none |

The preset values above are proposals. Like every operational number, they ship as proposed and the theatre's committee confirms them.
