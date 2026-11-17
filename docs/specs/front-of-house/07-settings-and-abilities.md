# 6. Settings and abilities

## Settings

Placement follows Foundations' settings format: the manifest declares a group for each first segment of the keys below (shifts, reminders, hours, checklists, incidents, night-report, retention, emergency), and every setting has exactly one home. All eight groups take the default, place console on the module's own generated page at /console/front-of-house/settings, one section per group; none names a bespoke screen and none is marked advanced. The retention group stays on this page rather than on the Advanced page because its periods are a welfare and insurance decision made by people running the theatre, not an engineering limit. No setting is declared with onChange confirm or reason, so none asks for extra confirmation on saving. Every duration is entered with the kit's DurationInput (a month is 30 days and a year is 365 days) and stored as whole seconds. All are changed by holders of `front-of-house.settings.manage`, have audience staff, and are not quotable, so those three columns are given once here and left out of the table.

| Key | Kind | Default | Limits | Purpose |
| --- | --- | --- | --- | --- |
| `front-of-house.shifts.window-before` | duration | 30 minutes | 0 to 4 hours | How long before call time a shift starts to give authority |
| `front-of-house.shifts.window-after` | duration | 60 minutes | 0 to 6 hours | How long after the shift's end it keeps giving authority |
| `front-of-house.shifts.sign-up-closes` | duration | 2 hours | 0 to 14 days | Before call time. Sets `sign_up_closes_at` on new shifts |
| `front-of-house.shifts.confirmation` | choice | automatic | automatic, manager | Whether a sign-up is confirmed at once or waits for a manager |
| `front-of-house.shifts.release-notice` | duration | 48 hours | 0 to 14 days | Inside this, a release waits for cover or a manager |
| `front-of-house.shifts.late-after` | duration | 30 minutes | 5 minutes to 2 hours | After call time, when the board flags someone as not arrived |
| `front-of-house.reminders.first` | duration | 48 hours | 0 to 14 days; 0 turns it off | First reminder before call time |
| `front-of-house.reminders.second` | duration | 3 hours | 0 to 48 hours; 0 turns it off | Second reminder |
| `front-of-house.hours.count-from` | choice | scheduled | scheduled, checked | What volunteer hours are counted from |
| `front-of-house.checklists.block-house-open` | boolean | false |  | Refuse "house open" while a pre-show checklist is unfinished |
| `front-of-house.incidents.review-within` | duration | 72 hours | 1 hour to 30 days | When an unopened incident is flagged |
| `front-of-house.incidents.immediate-severity` | choice | serious | minor, moderate, serious | At or above this, managers are told at once; below, in a daily digest |
| `front-of-house.night-report.sign-off-by` | duration | 12 hours | 1 hour to 7 days | After the performance ends, when an unsigned report is chased |
| `front-of-house.night-report.auto-distribute` | boolean | true |  | Send the signed report to those who may view it |
| `front-of-house.retention.assignments` | duration | 2 years | 6 months to 7 years | How long rota history is kept |
| `front-of-house.retention.checklists` | duration | 1 year | 3 months to 7 years | How long checklist runs are kept |
| `front-of-house.retention.incidents` | duration | 3 years | 1 to 10 years | How long an incident's personal data and free text are kept after closing |
| `front-of-house.retention.incidents-child` | duration | 21 years | 3 to 25 years | The same, when a child was involved |
| `front-of-house.emergency.review-every` | duration | 1 year | 1 month to 3 years | When the health check warns that a card is stale |

The retention defaults are a starting point, not legal advice. The settings page says so and that the period is the theatre's decision, often set by its insurer or its parent body.

Night reports and the incident's own row (number, kind, severity, dates) have no retention: they are the theatre's history and hold nothing personal.

## Abilities

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `front-of-house.shift.sign-up` | site | normal | ignored |  | See open shifts, sign up, release, take cover | Fact `core.member`; preset `volunteer` |
| `front-of-house.shift.view` | `core.performance` | normal | ignored |  | See the rota and the front of house section of Tonight for a performance | Fact `front-of-house.on-shift`; preset `front-of-house-manager` |
| `front-of-house.shift.manage` | `core.performance` | normal | ignored | shift.view, assignment.check-in | Create, publish and cancel shifts; assign and remove people; correct hours | `front-of-house-manager` |
| `front-of-house.assignment.check-in` | `core.performance` | normal | ignored | shift.view | Mark others arrived, record timings, extend tonight | Fact `front-of-house.leading-shift` |
| `front-of-house.checklist.complete` | `core.performance` | normal | ignored |  | Enter items and complete a run | Fact `front-of-house.on-shift` |
| `front-of-house.checklist.manage` | site | normal | ignored |  | Edit checklists and emergency cards | `front-of-house-manager` |
| `front-of-house.duty.manage` | site | normal | ignored |  | Edit duties and rota templates | `front-of-house-manager` |
| `front-of-house.emergency-card.view` | site | normal | ignored |  | Open the emergency card | Fact `front-of-house.rostered`; fact `core.member` |
| `front-of-house.incident.report` | site | normal | grants |  | Report an incident; see one's own reports in limited form | Fact `core.member`; fact `front-of-house.on-shift`; preset `volunteer` |
| `front-of-house.incident.view` | site | privileged | ignored |  | Open any incident, with people and welfare details. `audit: 'read'` | `welfare-lead`; `front-of-house-manager` |
| `front-of-house.incident.manage` | site | privileged | ignored | incident.view | Review, change severity, add actions, close | `welfare-lead`; `front-of-house-manager` |
| `front-of-house.incident.redact-person` | site | privileged, fresh | ignored | incident.view | Search for and redact a person with no account, for a data request | `welfare-lead`; `administrator` |
| `front-of-house.night-report.write` | `core.performance` | normal | ignored | shift.view | Add notes and addenda | Fact `front-of-house.leading-shift` |
| `front-of-house.night-report.sign-off` | `core.performance` | normal | ignored | night-report.write | Sign off the night | Fact `front-of-house.leading-shift`; `front-of-house-manager` |
| `front-of-house.night-report.view` | `core.performance` | normal | ignored |  | Read night reports | `front-of-house-manager`; `committee-member`; `production-lead` and fact `core.production-team`, for their own production |
| `front-of-house.hours.view` | site | normal | ignored | core.account.find | See and export everyone's hours. `audit: 'read'` | `front-of-house-manager` |
| `front-of-house.settings.manage` | site | privileged | ignored |  | Change the settings above | `administrator` |

Notes:

- **Owner grants** on `incident.report` is what lets a reporter see their own reports. The service limits what they see; the ability does not.
- **Welfare lead** is one of Identity's fifteen preset roles, kept apart from administrator. An administrator does not hold `incident.view` by default; it holds `incident.redact-person` because data requests are an administrator's work, and that ability implies the view it needs.
- **Leading a shift and privileged abilities.** None of the abilities suggested for `front-of-house.leading-shift` is privileged, so the defaults need no confirmation. A theatre that maps a privileged ability to a fact, for example Identity's `core.emergency-contact.read` to leading a shift, is asked to confirm, as Foundations requires.
- **No refusals are declared.** The rule that a serious incident is not closed by its reporter is a guard in the service.
- **Search and redaction for people with no account.** `incident.redact-person` covers both, as Identity's data-request screen needs: the search is limited to incident people by name or contact, and each search is audited.
- **A theatre whose duty managers are staff, not rostered.** There is no preset for it. The theatre grants `front-of-house-manager`, or makes its own role holding shift.view, assignment.check-in, checklist.complete and night-report.sign-off.

## Preset roles this module maps onto

Identity owns roles and its presets stay at fifteen. This module adds none; it maps its abilities onto Identity's existing keys.

| Preset key | Scope | Abilities from this module |
| --- | --- | --- |
| `front-of-house-manager` | site | shift.manage, checklist.manage, duty.manage, incident.manage, night-report.sign-off, night-report.view, hours.view |
| `welfare-lead` | site | incident.manage, incident.redact-person |
| `administrator` | site | settings.manage, incident.redact-person |
| `committee-member` | site | night-report.view |
| `production-lead` | one production | night-report.view |
| `volunteer` | site | None by role: the role is a standing. As a member-side person a volunteer gets shift.sign-up and incident.report through the suggested holders above |
