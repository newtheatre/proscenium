# 6. Settings and abilities

Training declares 17 settings, 14 abilities, 4 record types and 2 facts, in the Foundations registry formats. No rule in part 3 holds a number: every period and limit is one of the settings below.

## Settings

Every setting is changed with `training.settings.manage`. None is public, so none is quotable on a content page.

| Key | Kind | Default | Limits | Audience | Purpose |
| --- | --- | --- | --- | --- | --- |
| `training.records.default-valid-for` | duration | 730d | 30d to 3650d | staff | The validity offered when a course is created. The course's own `valid_for` is what counts |
| `training.records.warn-before` | duration | 30d | 1d to 180d | signed-in | How long before expiry a person is warned and the badge reads "Expires soon" |
| `training.records.renew-window` | duration | 60d | 0d to 365d | signed-in | Renewing this close to expiry runs the new validity from the old expiry |
| `training.records.renew-grace` | duration | 30d | 0d to 365d | signed-in | How long after a lapse the renewal steps are still enough |
| `training.records.digest` | boolean | true |  | staff | Send the weekly digest of lapsing training records and unmarked sessions |
| `training.versions.retrain-grace` | duration | 28d | 0d to 180d | staff | How long holders keep a training record after a version requires retraining |
| `training.progress.complete-within` | duration | 180d | 7d to 730d | signed-in | How long a sign-off counts towards a course not yet completed |
| `training.sessions.default-capacity` | integer (places) | 12 | 1 to 500 | staff | The capacity offered for a new session |
| `training.sessions.sign-up-closes-before` | duration | 2h | 0m to 14d | signed-in | How long before the start a person can still sign themself up |
| `training.sessions.cancel-until` | duration | 24h | 0m to 14d | signed-in | How long before the start a person can still cancel their own place |
| `training.sessions.reminder-before` | duration | 24h | 1h to 14d | staff | When the reminder is sent |
| `training.sessions.waiting-list` | boolean | true |  | signed-in | Whether a full session takes a waiting list |
| `training.sessions.mark-within` | duration | 7d | 1d to 60d | staff | How long after a session attendance can be marked or corrected, and when it is chased |
| `training.evidence.self-submit` | boolean | true |  | signed-in | Whether a person may send in their own certificate for checking |
| `training.retention.records` | duration | 1095d | 0d to 3650d | staff | How long an ended or lapsed training record is kept before it is anonymised |
| `training.retention.evidence` | duration | 90d | 0d to 1095d | staff | How long evidence and its file are kept after the training record it earned has ended |
| `training.retention.attendance` | duration | 730d | 30d to 3650d | staff | How long places and session-trainer rows are kept |

Rules across settings, each refusing the save with its own message:

| Rule id | Check |
| --- | --- |
| `warn-inside-validity` | `records.warn-before` is shorter than `records.default-valid-for` |
| `renew-inside-validity` | `records.renew-window` is no longer than `records.default-valid-for` |
| `evidence-not-outliving-record` | `retention.evidence` is no longer than `retention.records` |
| `reminder-before-cancel-deadline` | `sessions.reminder-before` is at least `sessions.cancel-until`, so the reminder arrives while a person can still cancel |

Presets differ from the defaults in one place: `student-society` sets `training.records.default-valid-for` to 365d, because a student body turns over every year. Saving a course whose own `valid_for` is shorter than the warning period is refused in the course's service, since the registry's rules cover settings only.

## Record types

| Record type | Table | Parent | Owner column | A grant on one covers |
| --- | --- | --- | --- | --- |
| `training.course` | `training_courses` | none | none | The course, its sessions and the training records for it |
| `training.session` | `training_sessions` | `training.course` | none | Reached through its course; nothing is granted on one session |
| `training.record` | `training_records` | `training.course` | `account_id` | Reached through its course, or by ownership |
| `training.competency` | `training_competencies` | none | none | The target of the fact and of audit entries; nothing is granted on one |

A trainer is not a kind of account and not a role. A course's trainers are the accounts listed in `training_course_trainers`, and the fact `training.course-trainer` gives them the abilities the presets map to it, at that course only. The course's Trainers tab lists, adds and removes them. It needs `training.course.manage` at the course and makes no grant through Identity.

## Abilities

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `training.course.view` | site | normal |  |  | See live courses, their steps and sessions. Not audited | Fact `core.member` |
| `training.course.manage` | `training.course` | normal |  | `course.view` | Create a course, edit steps, publish a version, retire | `technical-manager`, `administrator`; `bar-manager` and `front-of-house-manager` at their department's courses |
| `training.competency.manage` | site | privileged |  | `course.view` | Create a competency and change its courses. Privileged because it changes who meets every requirement that names it | `technical-manager`, `administrator` |
| `training.session.manage` | `training.course` | normal |  | `course.view` | Create, change and cancel sessions | `technical-manager`, `administrator`; `bar-manager` and `front-of-house-manager` at their department's courses |
| `training.session.run` | `training.course` | normal |  | `course.view` | Mark attendance, add a walk-in, close attendance | Fact `training.course-trainer` |
| `training.place.book` | site | normal |  | `course.view` | Take, and cancel, one's own place | Fact `core.member` |
| `training.place.manage` | `training.course` | normal |  | `course.view` | Give or cancel another person's place | `technical-manager`, `administrator`; `bar-manager` and `front-of-house-manager` at their department's courses |
| `training.sign-off.record` | `training.course` | normal |  | `course.view` | Sign a person off on a practical step; void one's own sign-off | Fact `training.course-trainer` |
| `training.record.view` | `training.record` | normal, reads audited | grants | `course.view` | See a person's training records, progress and competencies | `technical-manager`, `administrator`; `bar-manager` and `front-of-house-manager` at their department's courses; whoever plans a rota |
| `training.record.award` | `training.course` | privileged |  | `record.view` | Award a training record without the steps | `administrator` only. Never a fact |
| `training.record.revoke` | `training.record` | privileged |  | `record.view` | Revoke a training record; void any sign-off | `administrator` only. Never a fact |
| `training.evidence.verify` | `training.course` | privileged |  |  | Open evidence and verify or reject it | `technical-manager`, `administrator`; `welfare-lead` at safeguarding courses |
| `training.record.export` | site | privileged |  | `record.view` | Export people, training records and the matrix. May be granted site-wide only | `technical-manager`, `administrator` |
| `training.settings.manage` | site | privileged |  |  | Change Training's settings | `owner`, `administrator`, `technical-manager` |

- **Own things need no grant.** `owner: 'grants'` on `training.record.view` is how a person sees their own training records. Their own progress, places and evidence are read by routes declared `signed-in` that only ever select the caller's rows.
- **Privileged abilities** need strong assurance and a fresh re-assertion, by Foundations' default. No fact is suggested for one.
- **`training.record.view` audits reads** (`audit: 'read'`), because the People list shows who is and is not trained. A person's own reads are not audited.
- **`training.evidence.verify` does not imply `record.view`**, so a welfare officer can check safeguarding evidence without seeing the rest of anybody's training.

## Guards that are not abilities

Roles, facts and ownership only allow. These refusals are guards in Training's own service, applied to every role including the Owner.

| Guard | Refusal code | Where |
| --- | --- | --- |
| Nobody signs off their own practical step | `training.own-sign-off` | Part 3, S4 |
| Nobody verifies their own evidence | `training.own-evidence` | S4 |
| Nobody awards a training record to themself | `training.own-award` | A6 |
| Nobody marks their own attendance | `training.own-attendance` | A trainer who is also learning is marked by another trainer |
| A published version is not edited | `training.version-published` | V2 |
| Evidence the step forbids is not stored | `training.evidence-forbidden` | E2 |

## The facts

| Fact | On | Holds | Until | Standing |
| --- | --- | --- | --- | --- |
| `training.competent` | `training.competency` | The account holds the competency now (part 3, C1) | The earliest expiry among the competency's courses | No |
| `training.course-trainer` | `training.course` | The account is listed as a trainer of the course in `training_course_trainers` (part 2) | The row is removed | No |

Both facts are declared `pin: true`, so a theatre may map either to abilities for one named record on Identity's permission screen (part 4), and each is resolved in one keyed read. No preset maps an ability to `training.competent`, because which competency unlocks what is each theatre's choice. The presets map `training.course-trainer` as the table below says. Neither is a standing: a trainer is expected to be a member already, and declaring `standing: true` on `training.course-trainer` later is a one-line change that would open the members' area to outside trainers.

## Preset mappings

| Preset | Role or fact | Abilities mapped |
| --- | --- | --- |
| All three | Fact `core.member` | `training.course.view`, `training.place.book` |
| All three | Roles `technical-manager` and `administrator` | `training.course.manage`, `training.competency.manage`, `training.session.manage`, `training.place.manage`, `training.record.view`, `training.record.export`, `training.evidence.verify`, `training.settings.manage` |
| All three | Role `administrator` only | `training.record.award`, `training.record.revoke` |
| All three | Fact `training.course-trainer`, unpinned, so judged against the course in hand | `training.session.run`, `training.sign-off.record` |
| All three | Roles `bar-manager` and `front-of-house-manager` | Nothing by preset, because a preset creates no courses. Suggested on the course screen when a department's course is made: `training.course.manage`, `training.session.manage`, `training.place.manage` and `training.record.view`, granted at that course |
| `student-society` | Fact `front-of-house.on-shift`, if Front of house is on | Nothing. A shift is not a reason to see anybody's training |

Training adds no preset role, so Identity's presets stay at fifteen. Naming a course's trainers needs `training.course.manage` at that course and not `core.grant.manage`. A theatre with a dedicated training officer creates that role itself and maps the second row to it.
