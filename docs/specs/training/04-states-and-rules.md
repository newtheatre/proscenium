# 3. States and rules

The rule that runs through the original part 3 still runs through this one: whether a person is trained is worked out from rows and dates at the moment somebody asks. Routes add an "or" at the top, new step kinds add ways to write a sign-off at the bottom, and nothing in between changes. Rules are numbered so stories and tests can cite them; numbers not used in the original are new, and C1 and C4 are replaced.

*[Drawing: how a verdict is worked out · routes in order, two kinds of item]*

Every route is tried, so `until` can take the latest held route; nothing is stored, so the same rows answer for the past and the future.

## Competencies and routes (replaces C1 and C4)

- **R1.** An active competency has at least one active route, and every active route has at least one item. The screen refuses to make a competency active, or to retire its last route, otherwise.
- **R2. A route holds** for a person at an instant when every item holds: a `course` item when the person has a training record for that course that was awarded before the instant, not ended before it and not expired at it (the old C1, per course); a `recognised` item when the kit's `requirements.check` answers `met` for that reference at that instant.
- **R3. A competency holds** at an instant when it is active and at least one of its active routes holds.
- **R4. Until.** A held route's `until` is the earliest `until` among its items, where a recognised item's is the one its source gives and may be open. A held competency's `until` is the latest `until` among the routes held. So a person with both an outside certificate and our course is covered until the later of the two.
- **R5. The reason when not held** names each active route in order, at most three, with what it lacks: "Not met. You could hold First aider by: our First aid course (next session Thursday 3 December); or an outside first-aid certificate (send one in); or being a St John Ambulance volunteer (not recorded)." A route that is nearly held (some items held) is listed first. The help link goes to the competency's page for learners (part 5, M13).
- **R6. Recognised items are asked, never copied.** Training calls `requirements.check` with `whenUnavailable: 'not-met'`, because a recognised item grants something; a source switched off therefore never makes anybody competent. The verdict's `summary` says when a held competency rests on an unavailable source.
- **R7. No loops.** A route item may not name a `training:` reference, nor a `fact:training.` one, so no chain of checks can lead back to Training. Competency inside competency is modelled by listing the same courses in both. Integration ruling R3-22 confirms nested checks, and the kit adds a depth limit that answers `unavailable` rather than looping.
- **R8. Cost.** One `check` call answers any number of accounts and competencies in at most two queries of Training's own tables, plus one kit call per distinct recognised source, made only for the pairs that no course route already holds.
- **R9. Changing routes** (adding, retiring, reordering, or changing a route's items) changes who holds the competency from the next read. Like C5, the screen shows how many hold it before and after, needs `training.competency.manage`, and is audited. Retiring a route keeps its rows.
- **R10.** The fact `training.competent` follows R3 exactly. Its `until` follows R4.
- **R11. Held by.** Where a figure or a list needs to say how a person holds a competency, it names the first held route by position. This is a label only; R3 decides.

## Steps and what signs each off (replaces the original table)

| Step kind | How it is delivered | Signed off by | Sign-off kind | Guard |
| --- | --- | --- | --- | --- |
| Session | In person, at a dated session | A place marked attended | `attendance` | Same unit as the mark (S6) |
| Practical | On the job, watched by a trainer | A trainer of the course | `trainer` | Never the person (S4) |
| Activity | On shift, alongside someone, reported by another module | The source's confirmed occurrences, `times_required` of them | `activity` | Confirmed by somebody other than the person (H3) |
| Reading | Material on a page or file | The person confirming they read it | `self` | The material was opened in this session |
| Online lesson | Sections in the app | Reaching the last section with every section reached | `lesson` | Signed in (O2) |
| Quiz | A form with an answer key | A passing attempt | `quiz` | Marked on the server (Q2) |
| Certificate | Outside evidence with its own expiry | The evidence verified | `evidence` | Never verified by its subject (S4) |
| Declaration | Experience gained elsewhere, stated with optional evidence | The declaration approved | `evidence` | Never approved by its subject (S4) |

- **W1. Ways to learn** are derived from the live version's steps: *in person* (session, practical), *on shift* (activity), *online* (reading, lesson, quiz) and *from outside* (certificate, declaration). A course may show several. The catalogue filters by them.
- **W2.** Steps have a suggested order (their position) and the course page shows them in it, but nothing enforces it. A person who passes the quiz before reading the lesson has shown what the quiz asks.

## Online lessons

*[Drawing: online lesson · sections to sign-off]*

- **O1.** A lesson's sections open in order. A section is reached when the signed-in person opens it; the next section opens once the one before is reached. Going back is always allowed. Reaching is recorded once (`ON CONFLICT DO NOTHING`).
- **O2.** Reaching a section evaluates the step in the same unit: when every section of the step is reached, counting progress inside `training.progress.complete-within`, the `lesson` sign-off is written and the award evaluated (A1). There is no "finish" button beyond the last section's "Done".
- **O3. Practice sections.** A `practice` section shows the scenario's label and "Try it in practice mode", opening `/practice/<scenario id>`. It is reached when the person presses "I've tried it". Where Practice mode says the scenario is not available, the section says so and can still be passed, so a switched-off module never strands a learner.
- **O4.** Nothing is timed and nothing measures whether a video was watched. An embedded player cannot report it reliably across hosts, and a timer only teaches people to wait (question 3).
- **O5.** Lesson content is part of the course version, so V2 applies: a correction is a new version. Starting a version copies every section, each carrying from the one it copies. Editing a section's text keeps its carry; the author ticking "this section has changed" clears it, and that section must be reached again by people part-way through. Whether holders must retrain is still V4's one question.

## Quizzes

*[Drawing: quiz attempt · limit, marking, sign-off]*

- **Q1.** A quiz step names a form in the slot `training.quiz`. Publishing the course version pins the form's live version on the step (V9). A form with no answer key or no pass mark cannot be pinned: publishing refuses with `training.quiz.not-marked`.
- **Q2. One unit.** The person's answers go to Training's own route. In one unit of work Training calls Forms' `addResponse` with the pinned version, receives the marking (FB-513), inserts the attempt, and if it passed writes the `quiz` sign-off and evaluates the award. A forced failure anywhere writes none of them.
- **Q3. Attempts.** A person may have at most `max_attempts` failed attempts on a step within any period of `retry_after`, counted since the latest allowance. The attempt is inserted with that count as the statement's predicate and expected to write one row, so two submissions at the same moment cannot both pass the limit. A refused submission is not stored by Forms either, because it is in the same unit. With `max_attempts` null there is no limit.
- **Q4. What the person sees.** The score and pass or fail at once, always. Which answers were wrong, the correct answers and each question's feedback follow `show_answers`: `never`, `after-pass` (the default), or `after-each`. The answer key never reaches the browser before submission; FB-513 strips it from the definition.
- **Q5.** A passed quiz is not taken again for the same completion. It is offered again when renewal needs it (A2).
- **Q6. Allowance.** A holder of `training.sign-off.record` at the course may allow a person another try now, with an optional note. It is an `allowance` row, audited. Nobody allows their own (`training.own-allowance`).

## Activity steps (shadowed shifts)

*[Drawing: activity step · a shadowed shift to a sign-off]*

- **H1.** An activity step names a source contributed to `training.step-source` and its parameters. The source reports occurrences: an id, the person, the local date, and who confirmed it.
- **H2. When Training looks.** It listens for the event the source declares (Front of house: `front-of-house.shadow.confirmed`), and reads the source for that person; it also reads when the person opens the course, and in the daily sweep for people with progress on an activity step. Each read asks only for occurrences since the start of the progress window.
- **H3.** Only confirmed occurrences count, and never one confirmed by the person themself. Each occurrence writes one `activity` sign-off dated on its day, once per course (the partial unique index). The step is met when `times_required` of them count (S1, S3).
- **H4.** A source switched off reports nothing; sign-offs already written stand. An occurrence the source later withdraws does not undo a sign-off: a trainer voids it by hand (S5), as with any other mistake.

## Certificates and declarations (adds to E1 to E4)

*[Drawing: evidence life cycle · certificates and declarations, 5 states]*

| From | To | By |
| --- | --- | --- |
| (none) | `submitted` | The person, when `training.evidence.self-submit` is on; or staff for them |
| `submitted` | `verified` | A holder of `training.evidence.verify` at the course, never its subject. For a declaration the screen says "Approve" |
| `submitted` | `rejected` | The same, with a reason the person sees |
| `submitted` | `withdrawn` | The person |

- **E5.** A declaration needs a statement. Where the step has a form, its questions are answered and stored through `addResponse` in the same unit as the evidence row.
- **E6.** A rejected declaration or certificate stays as it was. The person may send a new one, which is a new row; the screen shows the last reason beside the new attempt.
- **E7.** A certificate step with a list of recognised qualifications offers that list. Where `other_qualification` is on, a person may name another, and the verifier sees "Not on the list" beside it.
- **E8.** Evidence waiting longer than `training.evidence.chase-after` shows on the console home of holders of `training.evidence.verify` at that course and in the weekly digest.
- **E9.** A declaration earns what its step's course gives: the training record runs for the course's `valid_for` like any other. A declaration carries no expiry of its own unless the person gives an end date for a qualification, which A3 then applies.

## Versions (adds to V1 to V8)

*[Drawing: publishing a version · the added pinning step]*

- **V9.** Publishing a course version pins the live version of every quiz and declaration form its steps name. A later form version does not reach the course until a new course version pins it; the course screen says "A newer version of this quiz exists" with "Start a new course version".
- **V10.** A changed pinned form version, a changed activity source or parameters, or a changed list of recognised qualifications clears a step's carry, as changing its kind does (V3).

## Uploaded video (Cloudflare Stream)

Added 24 November 2026 after Matt's answer to question 4. A lesson section's video comes either from a host allowed in core.video.player-hosts or from an upload to the theatre's own Cloudflare Stream account. Either way it plays in core's one video player (C-64), whose rules (VL1, VL3 to VL5) Training does not restate. Training never stores or serves the video itself.

*[Drawing: uploaded video · five states]*

- **VD1. Upload.** A person with `training.course.manage` at the course uploads a video into a section of a version in preparation. This is offered only while `training.videos.stream-account` and the credential `training.stream-token` are both set. Training asks Stream for a one-time direct upload address (`/stream/direct_upload`) with `maxDurationSeconds` taken from `training.videos.max-duration`, `requireSignedURLs` on and a one-hour expiry. It then writes a `training_videos` row in state `uploading`, audited as `training.video.uploaded`. The browser sends the file straight to Stream, so it never passes through the Worker and no Worker request limit applies.
- **VD2. States.** A video moves from `uploading` to `processing` to `ready`, or to `failed` with Stream's reason. Training reads the state from Stream at four points: while K10 is open (every five seconds, for that video only), when a version is published, on opening the section in the editor, and in the daily sweep. There is no webhook, so there is no webhook secret to hold. An upload not started before its address expires becomes `failed`.
- **VD3. Publishing.** A version with a section whose uploaded video is not `ready` is refused with `training.video.not-ready`, naming the section. The caption note rule (TR-03) applies to uploaded video as it does to embedded video.
- **VD4. Playback.** A section shows an uploaded video only to someone who may open the lesson: a person who may view the course, a trainer of it, or a holder of `training.course.manage`. For each view, Training signs a short token for that one video, valid for `training.videos.playback-for`. It signs locally with the signing key held as the credential `training.stream-signing-key`, so no call to Stream is made per view. Training creates that key through Stream's API on the first upload and never shows it. The token goes straight to core's video player as the source { host: 'stream', signedToken } (C-64); it is never stored or parsed.
- **VD5. Unavailable.** If the token or account is removed, or Stream refuses, the section shows "This video can't be played at the moment" and can still be reached, as a practice section can (O3). Upload controls are replaced by a line pointing to Training's settings. Embedded videos are unaffected.
- **VD6. Versions.** A section carried into the next version keeps the same video, with no upload again. Ticking the section as changed and uploading a replacement gives the new version its own video.
- **VD7. Deletion.** The daily sweep deletes a video from Stream, and marks its row `deleted`, once no version references it that is in preparation, published, or the version under which a current training record was awarded, and `training.videos.delete-after` has passed since the last such reference ended. A video removed from a version that was never published is deleted at once. Deletions are set-wise and paged (T4) and audited as `training.video.deleted`.
- **VD8. People in videos.** Videos are course content, not anyone's personal record, so erasing a person does not delete them; `uploaded_by` is anonymised like every other actor column. K10 asks authors not to upload footage of identifiable people without their agreement. If someone asks to be removed, a holder of `training.course.manage` can delete a video at once. Where a published version uses it, a confirmation names the versions, and the section then shows "This video has been removed".
- **VD9. Cost.** Stream charges for minutes stored and minutes delivered. Training's settings page shows the minutes stored, read from Stream, beside the upload settings. Prices were not checked for this specification.

| From | To | By | When |
| --- | --- | --- | --- |
| (none) | `uploading` | A course manager | VD1 |
| `uploading` | `processing` | Stream, read by Training | The file has arrived |
| `processing` | `ready` | Stream, read by Training | Stream reports it ready to stream |
| `uploading` or `processing` | `failed` | Stream, or the address expiring | VD2 |
| `ready` or `failed` | `deleted` | The daily sweep, or a course manager | VD7, VD8 |

## Unchanged, restated where routes touch them

- **C2, C3.** The instant may be in the future or the past, for every item kind. For a recognised item in the past, the answer is what the other source says about that instant; Training does not remember what it said before.
- **C6.** Training never blocks anything itself.
- **C7.** Every read, count and claim uses the account scope, including attempt limits and lesson progress.
- **T2.** With Training off, the kit answers `unavailable` for every `training:` reference, as before. Recognised items make no difference to that.
