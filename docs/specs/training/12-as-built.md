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

## Sessions (TR-09 to TR-14), 24 November 2026

- **The last place** is one conditional insert: booked only while `places_taken < capacity` on the statement, so of two people pressing at once one gets the place and the other is refused `training.session.full` with the waiting list offered (P2). The places triggers keep `places_taken`, and the table's check backs them.
- **Promotion** reads the first people waiting, then promotes them in the same unit, each only if still waiting when the statement runs, and tells them (P3, P4). A place promoted from the waiting list keeps its `waiting_since`, which is how it may be cancelled up to the start.
- **Rooms.** Publishing, or moving a published session, asks core's `isSpaceFree` (leaving out Training's own contribution) and Training's own published sessions, and refuses `training.session.space-taken` (P10). The refusal does not yet name what holds the space. Training contributes published sessions to `core.space-busy` as `training-session`, labelled "Training session", never giving way; so Training now requires the support module `occupancy`, as Spaces does.
- **Trainers of a session** are those named on it, or else the course's trainers. They are told of changes and cancellation, and named when it is too late to cancel.
- **Attendance** is marked from the start until `training.sessions.mark-within` after the end, never on one's own place (`training.own-attendance`). Marking attended writes one sign-off per session step of the version the session is held under, and evaluates the award, per person in the same unit; marking absent voids those sign-offs. These are statements per person rather than one set-wise statement, since each person's award is evaluated on its own; a session's capacity bounds them.
- **Walk-ins** without an account are found or made through `findOrCreateAccount` with origin `staff`.
- **Reminders** are sent by the task `training.send-reminders` every 30 minutes, once per place through the notification's dedupe key rather than a marker column. The reminder can be switched off under the topic `training.sessions`; every other session notice cannot.
- **Not yet:** the overdue-attendance card for trainers (P8), telling a holder whether attending would renew (P6), refusing to delete a space with future sessions, and the screens.
- **Abilities** added: `session.manage`, `session.run` (mapped by default to the course-trainer fact, beside `sign-off.record`), `place.book` and `place.manage`.

## Online lessons and quizzes (TR-39, TR-40, TR-42 to TR-45), 24 November 2026

- **Lesson sections** are saved on their own for a lesson step of the version in preparation (`PUT .../steps/<step>/sections`). Saving the course's steps keeps the sections of a step that stays a lesson. Starting a version copies every section, each carrying from the one it copies; ticking "changed" clears the carry (O5).
- **Reaching** is one row per person and section; reaching again inside the window changes nothing, and a reach from before the progress window or the last award is renewed. Progress on a section counts for the sections that carry from it. Reaching the last unreached section writes the `lesson` sign-off and evaluates the award in the same unit (O2). A practice section is reached the same way, by "I've tried it" (O3).
- **Video** in a section is an `https` address for now. The allowed hosts and uploaded video come with the video slice.
- **Quizzes.** A quiz step names a form attached to the course in the Forms slot `training.quiz`. Publishing the version pins each quiz step to its form's live version, and refuses `training.quiz.not-marked` unless that version has correct answers and a pass mark (Q1). For this, Forms gained one read in its services, `slotQuiz`.
- **Taking a quiz** sends the answers to Forms' `addResponse` with the pinned version in the same unit, inserts the attempt with the failed count as the statement's predicate (`training.quiz.limit`), and on a pass writes the `quiz` sign-off and evaluates the award (Q2, Q3). A refused attempt leaves no response in Forms.
- **What the person sees** is the score and pass or fail always, and which questions were right with their feedback as the step's `show_answers` allows. The correct answers themselves are not sent yet.
- **A passed quiz** is refused `training.quiz.passed` while it still counts towards completing the course; once a training record is awarded, taking it again counts towards renewal (A2).
- **Allowances** need `training.sign-off.record` at the course and are refused for oneself (`training.own-allowance`).
- **Sessions on a new version.** Publishing a version moves sessions not yet started onto it (V7).
