# 8. Test plan

The original plan's aim stands: the answer to "is this person trained, then?" is right at every instant, including ones nobody watched. The amendment adds cases that prove the new "or" at the top never widens what a competency means by accident, and that each new way to sign a step off happens once, on the server, in one unit. Cases replaced are marked; every other original case stands.

## Unit tier, added

| Case | Proves | Rule |
| --- | --- | --- |
| `routes.any-holds` | A competency with two routes is held when either holds and not when neither does | R3 |
| `routes.all-items` | A route of two items is not held with one | R2 |
| `routes.until-latest` | With two routes held, `until` is the later; with one item of a held route expiring sooner, that route's `until` is the earlier of its items | R4 |
| `routes.retired-ignored` | A retired route holds nothing, even when its items hold | R1, R3 |
| `routes.reason-order` | The reason lists at most three routes, nearest first, then by position | R5 |
| `routes.future-and-past` | The future and past instants of C2 and C3 hold through every route kind | C2, C3 |
| `ways-to-learn` | Each step kind maps to its way to learn; a course with mixed steps shows each | W1 |
| `lesson.complete` | All sections reached completes; one missing does not; reached outside the progress window does not count | O2 |
| `lesson.carry` | Progress on a carried section counts in the next version; a section ticked as changed must be reached again | O5 |
| `quiz.window` | Three failures in a day lock; the fourth opens exactly `retry_after` after the first of the three falls out of the window; an allowance resets the count | Q3, Q6 |
| `quiz.show-answers` | Each of the three values shows what it says, after a pass and after a fail | Q4 |
| `activity.count` | `times_required` confirmed occurrences meet the step; an unconfirmed or self-confirmed one does not count | H3 |
| `setting-rules` | Adds `retry-inside-progress` | Part 6 |

`holds.all-courses` is replaced by `routes.all-items`; `holds.until` by `routes.until-latest`.

## Integration tier, added

| Case | Proves | Rule |
| --- | --- | --- |
| `route-recognised-live` | A recognised item answers from its source at the instant asked; when the source is switched off, the item is not held and the summary says the source was unavailable | R2, R6 |
| `route-recognised-control` | The same run with `whenUnavailable: 'met'` makes everyone competent, so the test is known to bite | R6 |
| `route-self-reference` | A `training:` reference is refused by the service and by the check constraint | R7 |
| `route-check-bound` | Forty accounts, three competencies with mixed routes and two recognised sources: two queries of Training's tables and two kit calls, made only for pairs not already held by a course route | R8 |
| `route-change-counts` | Adding a route shows holders before and after, changes the next read, and is audited with `training.competency.routes-changed` | R9 |
| `fact-matches-routes` | `training.competent` agrees with the source for every person in a seeded set held through each kind of route | R10 |
| `lesson-one-unit` | Reaching the last section writes progress, sign-off, award, audit and event in one batch; a forced failure writes none | O2, A1 |
| `lesson-reach-twice` | Opening a section twice, or at once from two devices, records it once | O1 |
| `quiz-one-unit` | A passing submission writes the Forms response, the attempt, the sign-off and the award in one batch; a forced failure at the award leaves no response and no attempt | Q2 |
| `quiz-key-never-sent` | No route Training serves, before submission, contains an answer key, a correct answer, feedback or the pass mark | Q4 |
| `quiz-limit-race` | With one attempt left, two submissions at the same moment give one attempt and one refusal; neither leaves a stray Forms response | Q3 |
| `quiz-pinned-version` | After the form gets a new live version, the quiz still shows and marks against the pinned one until a new course version is published | V9 |
| `quiz-not-marked` | Publishing a course whose quiz form has no key or pass mark is refused with `training.quiz.not-marked` | Q1 |
| `allowance-not-own` | A trainer cannot allow their own extra attempt, for the Owner too | Q6 |
| `declaration-gate` | A declaration signs nothing until approved; approving signs and may award in one unit; not approved needs a reason, which the person sees; sending again makes a new row | E5, E6 |
| `declaration-not-own` | Approving one's own declaration is refused with `training.own-evidence` | S4 |
| `declaration-file-forbidden` | A step that forbids files refuses a declaration's file | E2 |
| `activity-once` | The same occurrence reported by event, by the sweep and on opening the course writes one sign-off | H2, H3 |
| `activity-source-off` | With Front of house off, nothing new is signed and existing sign-offs still count | H4 |
| `measures` | Each of the seven figures answers by its keys, sums across months and agrees with the rows; the ratio is not summed | Part 4 |
| `erasure-walk` | Adds: lesson progress deleted, declaration columns cleared and files deleted, attempts kept without notes | Part 2 |
| `download-complete` | Adds lesson progress, attempts and declarations | Part 2 |
| `merge-account-scope` | Adds: attempts under both accounts count to one limit; lesson progress under either counts for the survivor | C7 |

### Added 24 November 2026

The Stream cases run against a stub of Stream's API in the harness, so no test touches a real account. A control case that switches the stub off proves the tests would notice.

| Case | Tier | Proves | Rule |
| --- | --- | --- | --- |
| `video.token` | unit | A playback token names the one video, expires at `playback-for`, carries the key id and verifies with the public half of the signing key | VD4 |
| `video.states` | unit | Each Stream answer maps to the right state; an expired upload address gives `failed` | VD2 |
| `video-upload-direct` | integration | Asking to upload writes one `uploading` row and returns Stream's address; the Worker never receives the file; with no account or token the request is refused and K10 offers no upload | VD1 |
| `video-not-ready` | integration | Publishing with a processing or failed video is refused with `training.video.not-ready` naming the section | VD3 |
| `video-playback-gated` | integration | A token is issued to a person who may view the course, a trainer and a manager, and refused to anyone else | VD4 |
| `video-unavailable` | integration | With the token removed, the section shows the unavailable message, can still be reached, and the lesson can still be signed off | VD5 |
| `video-carry` | integration | A carried section keeps its video; a changed section with a new upload gets its own | VD6 |
| `video-delete-unreferenced` | integration | The sweep deletes only videos no live, draft or record-backing version references, and only after `delete-after`; a deletion is audited; a video still backing a current record is kept | VD7 |
| `video-delete-now` | integration | A manager's deletion of a published version's video asks for confirmation naming the versions, deletes it from Stream and shows the section as removed | VD8 |
| `erasure-walk` | integration | Adds: `uploaded_by` anonymised, the video kept | VD8 |
| `rostered-can-take-course` | integration | A rostered non-member can open a course, take its lesson and quiz and be awarded; a non-rostered non-member cannot | Question 2 |
| `practice-open-fact` | integration | The fact holds through each of its three ways and not through a course in preparation or archived; it agrees with M10's practice link | TR-58 |

## End-to-end tier, added

Each at phone and laptop width with the accessibility check.

| Case | Journey |
| --- | --- |
| `online-induction` | A manager writes a two-section lesson and a quiz from the template, makes a competency of it and publishes; a member does section one, leaves, comes back on another device, finishes, fails the quiz once, passes, and holds the competency; a host's rota check now says met |
| `quiz-locked` | A member fails three times, sees when it reopens; a trainer allows another try; the member passes |
| `two-routes` | First aider has our course and an outside certificate; a member sends a certificate, a verifier approves it, the member holds First aider until the certificate's date and M13 says "through an outside certificate" |
| `declare-experience` | A member declares running sound elsewhere with a link; it is not approved with a reason; they send again with a referee; it is approved and they hold Sound desk |
| `shadowed-shift` | A course needs two shadowed shifts as Duty manager; the member works two shifts marked shadowing; the lead confirms each at close; the member's step reads 2 of 2 |
| `how-to-get-it` | A rota refuses a member for lacking First aider; the link opens M13 with three routes and the nearest first |

| Case | Journey |
| --- | --- |
| `uploaded-video` | A manager saves a Stream account and token, uploads a short clip to a lesson section, sees it go from processing to ready and publishes; a member watches it on a phone; the token is removed and the member sees the unavailable message and still finishes the lesson |

## Fixtures, added

The seeded theatre gains: a competency with three routes (a course, a certificate course with a list of qualifications, and a recognised membership scheme); an online induction course of a lesson with a practice section and a quiz pinned to a form with an answer key; a course needing two shadowed shifts; and a stub step source in the test harness beside the worked-example host, so Training's tests do not need Front of house built.
