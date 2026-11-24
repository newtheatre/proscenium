# 4. Interface to other modules

Hosts see no change: they still store `training:tcmp_…`, call `requirements.check` with the instant that matters, and own what an unmet verdict does. What changes is underneath. Training now reads three things from other modules (a step source, Forms' marking, Practice mode's scenarios), asks other requirement sources for recognised route items, and contributes figures.

## Index of names, changes only

| Kind | Added | Withdrawn |
| --- | --- | --- |
| Module `uses` | `inventory` | |
| Points offered | `training.step-source`, now first release, with a settled contract | |
| Core points used | `core.practice-scenario` (read only, through Practice mode's service), `core.measure` (contributed) | |
| Form slots | `training.quiz`, `training.declaration` | `training.knowledge-check` |
| Outcome actions | | `training.sign-off-step` |
| File slots | `training.lesson-media` | |
| Events | `training.quiz.attempted`, `training.competency.routes-changed` | |
| Events listened for | Each step source's declared event; first `front-of-house.shadow.confirmed` | |
| Id prefixes | `trte`, `tlsc`, `tqat` | |
| Refusal codes | `training.quiz.not-marked`, `training.quiz.limit`, `training.route.self-reference`, `training.own-allowance` | |

## The requirement source, changed

The contract is unchanged. Inside it:

- `options` still lists active competencies; their description now names the routes in order, in a short line.
- `check` follows part 3, R2 to R8. It may call `requirements.check` itself for recognised items. That is a source asking the kit while answering the kit, so Integration should confirm the kit allows it; Training never names its own source, so it cannot loop.
- The `reason` lists routes (R5). The `summary` gains the route held by: "First aider: current until 14 March 2027, through an outside certificate." The help link goes to the competency's page for learners.

## The point `training.step-source` (first release)

A code point. A contribution is a way another module's activity can sign off an activity step.

| Part | Meaning |
| --- | --- |
| `id` | `<module>.<name>`, such as `front-of-house.shadowed-shift` |
| `label` | Translation key: "Shadowed shift" |
| `params` | A schema for what a course author picks, such as `{ dutyId }`, with a picker component for the course editor |
| `describe(params)` | A label for stored parameters, such as "Shadowed shift as Duty manager" |
| `occurrences(accountIds, params, since)` | Rows of `{ accountId, occurrenceId, on, confirmedBy }`, only confirmed ones, in one bounded query. `on` is a theatre-local date |
| `event` | The event the source announces when an occurrence is confirmed, with `accountId` and an occurrence id in its payload |
| `ability` | Optional: what a course author needs to see the picker's choices |

Empty means activity steps cannot be chosen in the course editor. The first contribution is Front of house's, agreed with the festival-ready changes as **FH-51**: a shift assignment marked `shadowing` at sign-up or by the manager, confirmed by the shift lead on closing the shift, reported by duty, announcing `front-of-house.shadow.confirmed` with `{ assignmentId, accountId }`. Later sources need nothing new from Training: Bar could report supervised till openings, and Rehearsals a call worked as an assistant.

## Form slots

| Slot | Mode | Subject | Answered by | A form here may not have | Notes |
| --- | --- | --- | --- | --- | --- |
| `training.session-signup` | submission | `training.session` | The person booking | pages, stages, payment | Unchanged |
| `training.quiz` | submission | `training.course` | The learner | stages, payment, file questions | Needs an answer key and a pass mark (FB-513) before a course can pin it. FB-515's quiz template starts one |
| `training.declaration` | submission | `training.course` | The person declaring | stages, payment | Optional questions asked beside the statement |

Training hosts all three itself through `slotForms` and `addResponse`, so a response and Training's own row are written in one unit, and no outcome action or automatic transition is needed. Two things are asked of the form builder for this round, both agreed with spec 15:

- **FB-513.** An answer key, points, per-question feedback and a pass mark on a form version; marking on the server at submission; the key stripped from every definition sent to a browser; `score`, `out_of` and `passed` stored on the response; and `addResponse` returning `marking: { score, outOf, passed, perQuestion: [{ fieldKey, correct, feedback? }] }`.
- **A pinned version.** `addResponse` takes an optional `versionId`, a published version of the placement's form (otherwise refused `forms.version-not-of-form`), and marks against that version's key; `slotFormVersion(placementId, versionId)` returns that version's definition with the key and pass mark stripped. Part of FB-513, agreed with spec 15 on 23 November 2026. Pinning is open to host services only.

FB-514 (automatic transitions) is not needed by Training.

## Practice mode

A lesson section of kind `practice` names a scenario id from `core.practice-scenario`, such as `box-office.desk-sale`, and links to `/practice/<scenario id>`. The course editor lists scenarios through Practice mode's service. The learner needs `core.practice.use`, which every member holds. Practice mode never reads Training's tables. Later, Practice mode will announce `core.practice.scenario-completed` with the account, the scenario and its version; TR-54 lets a practice section be reached on that event instead of "I've tried it".

## Figures for Reports (`core.measure`)

Agreed with spec 12 against its draft contract. Every count is in the account scope and carries no names.

| Figure | Combine | Unit | By | Ability |
| --- | --- | --- | --- | --- |
| `training.holders` | `level` | count | `training.competency` | `training.record.view` |
| `training.lapsing` | `sum` | count | `training.course`, `month` | `training.record.view` |
| `training.completions` | `sum` | count | `training.course`, `training.route-kind`, `month` | `training.record.view` |
| `training.session-attendance` | `sum` | count | `training.place-outcome` (booked, attended, absent), `training.course`, `month` | `training.record.view` |
| `training.quiz-first-attempts` | `sum` | count | `training.quiz-step`, `month` | `training.record.view` |
| `training.quiz-first-passes` | `sum` | count | `training.quiz-step`, `month` | `training.record.view` |
| `training.quiz-pass-rate` | ratio of first passes over first attempts | percent | `training.quiz-step`, `month` | `training.record.view` |

`training.route-kind` codes are `in-person`, `online`, `on-shift`, `from-outside` and `direct`, taken from the ways to learn of the steps that earned the record (W1), or `direct` for a direct award.

## Events announced, added

| Event | When | Payload | Internal |
| --- | --- | --- | --- |
| `training.quiz.attempted` | An attempt is stored | attempt id, account id, step id, passed | Yes |
| `training.competency.routes-changed` | A competency's routes or items change | competency id | No |

`training.sign-off.recorded` now carries the new kinds. `training.evidence.submitted` and `training.evidence.decided` gain `kind` (certificate or declaration).

## Contributions to others' points, changed

| Point | Change |
| --- | --- |
| `core.navigation` | The console's Evidence entry is labelled "Evidence to check", its count covering declarations too |
| `core.home-card` | Members: "Carry on with Fire safety: 3 of 5 sections"; "You can try the Till quiz again from 18:00". Console: "2 declarations to decide" joins the certificates count. Trainers: "Alex has used their quiz attempts on Till" |
| `core.file-slot` | `training.lesson-media`: images in lesson sections, readable by anyone with `training.course.view`. `training.evidence-file` now also holds a declaration's file |
| `core.file-access` | Lesson media as above; declaration files as evidence files |
| `core.export-contributor` | Adds lesson progress, attempts and declarations |
| `core.erasure-handler` | Deletes lesson progress and declaration files |
| `core.measure` | The seven figures above |
| `core.setup-step` | "Add your first course" offers an online induction (a lesson and a quiz) as one of the examples to copy |
| `forms.slot` | `training.quiz`, `training.declaration`; `training.knowledge-check` withdrawn |
| `forms.outcome-action` | `training.sign-off-step` withdrawn |
| `forms.template` | Optional: a "Training quiz" template in the `training.quiz` slot, built on FB-515 |
| core.person-busy | New, per Integration ruling R3-04: a booked or attended place on a published session makes its person busy from start to end, and a session's trainers are busy for it too, so rotas and rehearsal calls can see the clash. Ids and times only |
| Core personal calendar feed (C-70) | Training contributes `core.calendar-feed` (C-70, spec 15) with id `training.sessions`. Its `events(accountId, from, to)` returns one event for each session in the window where the person has a booked or waiting place, or is a trainer. Each event is `{ key: 'training.session:<session id>', startsAt, endsAt, title, location, status, transparent }`. The title is public-safe: the course name and "Training" only, never a person's name. The location is the space's public name. The status is `confirmed`, `tentative` for a waiting place, or `cancelled` once the session or place is cancelled, so subscribed calendars remove it. A waiting place is `transparent`. Read over the account scope (C7). This replaces TR-34's own "add to my calendar". |

**Availability (spec, module `availability`).** Training contributes to `availability.target` a target with id `training.session`, label "Training session" and ability `training.session.manage`. Its `open({ from, to, accountIds, title })` returns a link to a new draft session on K3 with the time and title filled in; the chosen people are listed for staff to add as places once the session is published (P1), so nobody holds a place on a draft. Training also contributes one group, `training.course-waiting:<courseId>`: the people on the waiting list of any upcoming session of that course, read over the account scope (C7). Training keeps no separate list of people interested in a course, so it offers nothing beyond that.

**Practice mode (spec 13), after Matt's ruling of 24 November 2026 that practice is reached only through a course.** Training declares the fact `training.practice-open` on Practice's record type `core.practice-scenario`. A person holds it for scenario X while any of these is true: they may view (`training.course.view`) a course whose current published version has a lesson with a practice section naming X; they hold a current training record for a course whose version, as awarded, names X; or they are a trainer of such a course. Courses in preparation or archived open nothing. The presets map the fact to `core.practice.use`, and `core.practice.manage` covers administrators. While Training is off, only administrators can practise.

**Cloudflare Stream and core's video player (added 24 November 2026; Integration rulings of the same day).** Every lesson video, embedded or uploaded, plays in core's one video player (C-64), so Training states no player rules of its own. Core's setting `core.video.player-hosts` lists the allowed hosts (VL1). The frame, the consent before anything loads, the "Watch on" link and the content rules are VL3 to VL5. The player takes a resolved source. For an address stored in `video_url`, core's parser gives `{ host, videoId }`. For an uploaded video, Training passes `{ host: 'stream', signedToken }`, minted for each viewer (VD4). That token is never stored and never parsed. Saving `training.videos.stream-account` switches Stream's host on in `core.video.player-hosts`, so the content rules allow its frame. Training calls Stream's REST API at `api.cloudflare.com` with its own token, `training.stream-token`. Integration ruled that this token is scoped to Stream only, so it can be revoked without touching email sending. Core's credentials hold it, never a Worker secret. Training calls Stream for four things only: a direct upload address, a video's state, creating the signing key, and deleting a video. Playback tokens are signed in the Worker and need no call to Stream. There is no Stream binding and no webhook.

## Notification types, added

| Type | To | Can be switched off |
| --- | --- | --- |
| `training.quiz-locked` | The person, when their attempts are used up, saying when they can try again | Yes |
| `training.quiz-allowance` | The person, when a trainer allows another try | No |
| `training.evidence-decided` | Unchanged, now covering declarations | No |

## Jobs and tasks, changed

`training.sweep-records` (daily) also reads step sources for people with progress on an activity step (H2), and lists evidence waiting past `training.evidence.chase-after` for the digest (E8). It stays safe to run twice: activity sign-offs are unique per occurrence, and it decides nothing else. No new job or task.

## For other specs in this round

| Spec | What it gets from Training |
| --- | --- |
| Festival (2) | Festival crew can be given an online induction (a lesson and a quiz) as a route to their crew competency, taken on a phone before the festival. Question 2 asks whether rostered volunteers who are not members may take it |
| Productions (4), Rehearsals (5) | Requirements only, through `core.requirement`, if they want training-gated roles |
| Governance (6) | Training's course material can be a document in the register; nothing is shared beyond a link |
| Inventory (11) | Unchanged contract; it stores `training:tcmp_…` on categories and items |
| Reports (12) | The seven figures |
| Practice mode (13) | Scenario links from lessons |
| Festival-ready changes (15) | Consumer of FB-513, FB-515 and FH-51 |
