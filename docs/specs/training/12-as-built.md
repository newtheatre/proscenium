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
