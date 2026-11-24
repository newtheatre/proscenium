# 12. As built

Where the build departs from, or is narrower than, this specification and the second-round base it amends. The build is the reference from here on.

## Base (TR-01 to TR-08, TR-17 to TR-20), 24 November 2026

- **Tables.** All seventeen tables, with their checks and indexes, are in the first migration (`training-base`), so later slices add code, not schema. The places trigger that keeps `training_sessions.places_taken` is added by hand to that migration, as Bar's sale-line triggers are.
- **Step kinds.** The course editor's input takes session, practical, reading and certificate steps. Lesson, quiz, activity and declaration steps are accepted once the slices that sign them off are built; the table already allows all eight.
- **Superseding.** A new training record is written in three statements: every awarded record for the person and course is first marked superseded by itself, then the new row is inserted, then those rows are pointed at it. This keeps both the one-awarded index and the reference to the new row true at every statement.
- **What counts after an award.** A renewal or a retraining counts only sign-offs made after the training record it follows (or, after a revocation, after the revocation), so the sign-offs that earned a record never renew it.
- **Reading steps.** Opening the material is noted in the cache for a day, keyed by the sign-in session and the step; confirming without that note is refused `training.reading.not-opened`.
- **Guards and the Owner.** The own-sign-off and own-award guards apply to everyone, the Owner included: they are four-eyes rules, which Matt's ruling of 23 November 2026 on own records leaves in place. Revoking one's own record is not guarded, since it is never to one's benefit.
- **Abilities** are declared with the first route that needs them, as the conformance check requires. This slice declares `course.view`, `course.manage`, `sign-off.record`, `record.view`, `record.award`, `record.revoke` and `settings.manage`. The fact `training.competent` comes with competencies.
- **The point `training.step-source`** is declared in this slice, for Front of house's FH-51, with no contract file yet; its contract is part 4's table.
- **Notifications.** Only `training.record-awarded` (topic `training.records`, can be switched off) and `training.record-revoked` so far. Telling holders a version cut their training short waits for the job `training.notify-holders`.
- **Settings.** The seventeen of the second round plus `evidence.chase-after` and the two quiz settings. The video settings and Stream credentials come with uploaded video. Training's settings are on its page under Admin > Modules, following the platform's convention, not at `/console/training/settings`.

## Competencies (TR-22, TR-23, TR-35 to TR-37, TR-50), 24 November 2026

- **Verdicts** (`layers/training/server/verdicts.ts`) follow R2 to R8: one query for the asked competencies' active route items, one for the training records of the asked accounts over the merged account scope, then one kit `requirements.check` for the recognised items of pairs no route made of courses alone already holds. Nothing is stored.
- **The requirement source** answers `training:<competency id>`. A retired or unknown competency answers `unavailable`, so the host's `whenUnavailable` decides, as for Training switched off. It has no `checkAbility`: a rota asks about anyone. A person not signed in is not met, with a reason asking them to sign in.
- **Recognised items and other sources' guards.** A recognised item is checked as the actor of the request, so a source with a `checkAbility` (Membership, Awards and access schemes have one; roles do not) answers not met for someone else unless the actor may ask it.
- **Saving routes** sends every route in order. A route sent with its id keeps it; one sent without an id is new; a route left out is retired and kept after the others, never deleted (R9). A route's items are replaced whole. Course items must name existing courses.
- **Holders before and after** are both in the answer to the save, not shown before it: the screen shows the count beside the routes, and the save's answer says what it became. Counting holders reads people with a current record for a course of the competency, so a person holding it only through a recognised item is not counted.
- **References** of recognised items must look like `<source>:<id>`; a `training:` or `fact:training.` reference is refused `training.route.self-reference` (R7), as the table's check also does.
- **The learner's page** (`GET /api/training/me/competencies/<slug>`) lists active routes with progress per item. The next session and the next action per item come with sessions.
- **The fact `training.competent`** is declared `pin: true` with no default abilities, as part 4 says. It is judged by the same verdict as the source, now.
