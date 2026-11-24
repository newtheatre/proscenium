# 6. Settings and abilities

Nine settings and eight abilities. Each setting is a starting value a plan or a space may override with its own column, so a theatre rarely needs to change them. Who programmes is a grant on a season, so a festival's programmers cannot move the autumn season's shows.

## Settings

Placement follows Foundations' settings format: one group per first segment (board, publish, notices, plans, retention), each on the module's generated page at `/console/programme/settings`, reached from the cog on the programme pages. All are changed by holders of `programme-planning.plan.manage`, have audience staff, and are not quotable. Durations use the kit's DurationInput and are stored as whole seconds. Only the retention setting is declared `onChange: confirm`, because shortening it deletes entries at the next weekly run.

| Key | Kind | Default | Limits | Purpose |
| --- | --- | --- | --- | --- |
| `programme-planning.board.changeover` | duration | 30 minutes | 0 to 12 hours | A space's changeover when its profile sets none (W4). Read as at least core's turnaround |
| `programme-planning.board.snap` | choice | 5 minutes | 5, 10, 15, 30 minutes | What a drop snaps to |
| `programme-planning.board.day-starts` | time | 09:00 |  | First hour of Day view for a new plan |
| `programme-planning.board.day-ends` | time | 00:00 |  | Last hour; 00:00 means midnight |
| `programme-planning.publish.productions` | boolean | true |  | Whether a new plan's publish also publishes placed productions still in draft |
| `programme-planning.notices.send` | choice | automatic | automatic, manual | Rules N1 and N5 |
| `programme-planning.notices.gather` | duration | 30 minutes | 0 to 24 hours | Rule N4 |
| `programme-planning.plans.close-after` | duration | 1 day | 0 to 90 days | After the season's last day, when its plan closes (U8) |
| `programme-planning.retention.unsuccessful` | duration | 2 years | 6 months to 7 years | How long a declined or withdrawn entry is kept |

The retention default is a starting point, not legal advice. The settings page says so; old Proscenium's backlog flagged unsuccessful proposals as personal data needing a decided period (B-productions, open questions).

## Abilities

In Foundations' seven-column format. None is privileged; publishing is audited and carries a fresh check because it changes the public programme and tells people outside the theatre.

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `programme-planning.plan.view` | `core.season` | normal | ignored |  | See the plan, the board, the tray and warnings | `committee-member`, `technical-manager`, `front-of-house-manager` |
| `programme-planning.plan.manage` | `core.season` | normal | ignored | plan.view, placement.manage, entry.manage | Start a plan, set up the call and offered slots, plan spaces, close and reopen | programmer, `administrator` |
| `programme-planning.plan.publish` | `core.season` | normal; fresh 12 hours; audited | ignored | plan.view | Publish and tell acts | programmer, `administrator` |
| `programme-planning.placement.manage` | `core.season` | normal | ignored | plan.view | Drag, pencil, remove, acknowledge warnings | programmer, `administrator` |
| `programme-planning.entry.view` | `programme-planning.plan` | normal | ignored | plan.view | Read entries, their people and entry windows | `committee-member` |
| `programme-planning.entry.manage` | `programme-planning.plan` | normal | ignored | entry.view | Add and edit entries, their people, needs and entry windows | programmer, `administrator` |
| `programme-planning.entry.decide` | `programme-planning.plan` | normal; audited | refused | entry.view | Accept, decline or withdraw an entry not from the call. A person cannot decide their own entry | programmer, `administrator` |
| `programme-planning.entry.view-own` | `programme-planning.entry` | normal | required |  | See the state and told slots of entries one applied for or is a contact on | Fact `core.signed-in` |

An entry from the call is decided in the form builder's review, under its own abilities and conflict rules (FB-406); this module never lets a reviewer with a declared conflict decide through the back door, because the accept action runs only on the form's transition.

### Presets

Matt decided on 23 November 2026 (question 5) that Identity gains a sixteenth preset role key, programmer ("Programmer"; a festival may call it festival director), granted on one season or site-wide. It holds plan.manage, plan.publish and entry.decide. Until Identity adds it, the presets give the module to `administrator` and let `committee-member`, `technical-manager` and `front-of-house-manager` look. Once it exists, the presets give the module's managing abilities to programmer, with administrator keeping them too. Programme planning starts switched off in every theatre-type preset, and switched on in a festival preset if the Festival spec adds one.

Who shares programming abilities: `programmer` and `administrator` hold everything here; `committee-member`, `technical-manager` and `front-of-house-manager` only view; `production-lead` and `visiting-company` get nothing from this module (they see their own production through core and Companies). Asked of sibling specs, 23 November 2026: Festival gives `programmer` the festival season and timetable abilities, and Companies gives it engagement view and the ability to put an engagement forward for a slot, where each fits.

## Record types

`programme-planning.plan`, `programme-planning.entry`, `programme-planning.offered-slot` and `programme-planning.pencil`, with parents as in part 4.
