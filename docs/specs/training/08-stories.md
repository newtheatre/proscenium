# 7. Stories

Twenty-four stories are added, TR-35 to TR-58: twenty-three for the module's first release and one later. TR-53 moved into the first release and TR-55 to TR-58 were added on 24 November 2026 after Matt's answers. Six existing stories change and one is withdrawn. Training's first release now has 47 stories and stays in roadmap phase 5, but the map doc's proposed order puts Training with Communications straight after the specification updates, so that festival crew can be inducted online before the festival essentials (gate: StuFF).

## Existing stories, changed

| Id | Change |
| --- | --- |
| TR-02 | A course can be saved with steps of the eight kinds; a lesson needs at least one section; a quiz needs a form in the slot |
| TR-03 | Publishing pins quiz and declaration forms (V9), refuses an unmarked quiz (Q1) and refuses a video section without its caption note |
| TR-22 | Superseded by TR-35 for what a competency is made of. Its other acceptance (holders before and after) moves there |
| TR-23 | Done when R2 to R8 hold, including a competency held by a recognised route, and the reason names routes |
| TR-27 | Withdrawn: replaced by TR-42 to TR-45 |
| TR-28 | Brought forward to the first release as TR-49 |
| TR-30 | The three examples to copy become four, adding an online induction of one lesson and one quiz |

## Order of work, amended

| Order | Stories | What it gives | Rests on |
| --- | --- | --- | --- |
| 1 to 2 | TR-01 to TR-08 | Unchanged: courses, sign-offs, training records | The kit |
| 3 | TR-22, TR-23, **TR-35, TR-36, TR-50** | Competencies with routes; the verdict hosts ask for; the learner's "how to get it" page | Order 2 |
| 4 | TR-09 to TR-14 | Unchanged: sessions | Order 2 |
| 5 | **TR-39 to TR-41, TR-38** | Online lessons, practice links, ways to learn | Order 2; core's content editor; Practice mode for TR-41 |
| 6 | **TR-42 to TR-45** | Quizzes | Order 5; FB-513 |
| 7 | TR-16 to TR-21, **TR-46 to TR-48, TR-52** | Expiry, versions, evidence, declarations, recognised qualifications | Order 2 |
| 8 | **TR-37, TR-49** | Recognised elsewhere; shadowed shifts | Order 3; FH-51 for TR-49 |
| 9 | TR-15, TR-24, **TR-51** | Privacy, oversight, figures | Everything above; `core.measure` |

Orders 5 and 6 together are the smallest useful slice for a festival: an online induction any crew member can take on a phone, earning a competency a rota can require.

## First release, added

| Id | As | I want | So that | Done when | Rules, screens |
| --- | --- | --- | --- | --- | --- |
| TR-35 | a training manager | to give a competency several routes, each of one or more items | a person can hold First aider through our course or an outside certificate | Routes and items can be added, reordered and retired; any held route holds the competency; an active competency needs an active route with an item; saving shows holders before and after and is audited | R1 to R3, R9; K8 |
| TR-36 | a host module | a verdict that says how to get what is missing | a refused person knows their options | `until` is the latest among held routes; a not-met reason lists up to three routes, nearest first, with the next session or action; the summary names the route held through | R4, R5, R11 |
| TR-37 | a training manager | to recognise another body's qualification as a route item, checked live | Tech Crew members, say, count without paperwork | A recognised item stores another source's reference; the check is live at the instant with `whenUnavailable: 'not-met'`; a `training:` reference is refused; the cost stays within R8 | R2, R6 to R8; K8 |
| TR-38 | a member | to see how each course is taught | I can pick one I can do on my phone | Ways to learn are derived from the live steps and shown and filterable on M2 and K1; nothing sets them by hand | W1; M2, K1 |
| TR-39 | a training manager | to write an online lesson | the theory is taught once, the same way, to everyone | K10 adds, edits, reorders and removes up to 30 sections with text, images, a video from an allowed host and a caption note; it previews at phone width; it is frozen when published and copied with carry into the next version | O5, V2, V3; K10 |
| TR-40 | a learner | to work through a lesson on my phone, stop, and carry on later | I can learn on the bus | Sections open in order; going back is free; progress is kept per section; reaching the last with all reached writes the sign-off and may award, in one unit | O1, O2, A1; M10 |
| TR-41 | a learner | to try a real screen in practice mode from a lesson | I have used the till before my first shift | A practice section links to `/practice/<scenario id>`; "I've tried it" reaches it; an unavailable scenario can be passed | O3; M10 |
| TR-42 | a training manager | to add a quiz to a course | I know people understood the lesson | A quiz step names a form in `training.quiz`, created from the template if wanted; publishing pins its version and refuses one without a key and pass mark | Q1, V9; K2 |
| TR-43 | a learner | to take a quiz and see my result at once | I am not waiting for a trainer | Answers are marked on the server through FB-513; the attempt and, on a pass, the sign-off and any award are one unit; answers are shown as `show_answers` says; the key never reaches the browser | Q2, Q4; M11 |
| TR-44 | a theatre | quiz attempts to be limited | guessing does not pass | At most `max_attempts` failures in any `retry_after`; two simultaneous submissions cannot pass the limit; the refusal says when it reopens; the person is told once when locked | Q3 |
| TR-45 | a trainer | to let someone try again now | a person who has learnt it is not kept waiting | "Allow another try" writes an audited allowance with an optional note; never for oneself; the person is told | Q6; M7 |
| TR-46 | a member | to declare experience I gained elsewhere, with evidence | I don't redo training I have done | A declaration with statement, dates, place, link, referee, file and the step's questions is sent in one unit; it signs nothing off until approved; a file is refused where the step forbids one | E5; M12 |
| TR-47 | a verifier | to decide declarations and certificates in one queue, never my own | evidence is checked fairly and quickly | K9 lists both, oldest first, filterable; approve writes the sign-off and may award; not approved needs a reason the person sees; the person can send again | E1, E6, S4; K9 |
| TR-48 | a training manager | to list the outside qualifications a certificate step accepts | people pick the right one and verifiers check faster | The step holds up to 20 qualifications with issuers; M6 offers them first; "something else" only when allowed, flagged for the verifier | E7; K2, M6 |
| TR-49 | a training manager | a step signed off by shadowed shifts | on-the-job learning counts without a trainer filling in a form | The point `training.step-source` exists with the contract in part 4; an activity step picks Front of house's source (FH-51) and a duty; each confirmed occurrence writes one sign-off, once per course, whether reported by event, on opening the course or by the sweep; self-confirmed occurrences are skipped | H1 to H4 |
| TR-50 | a member | to see every way to become what I need | I choose the quickest route for me | M13 lists active routes in order with my progress per item and the next action; a host's refusal links to it | R5; M13 |
| TR-51 | Reports | Training's figures | training can sit beside attendance and volunteer hours | The seven measures in part 4 answer within the contract, by the keys listed, in the account scope, with no names | Part 4 |
| TR-52 | a verifier | to be reminded of evidence waiting | nobody waits weeks for a yes | Evidence waiting past `training.evidence.chase-after` shows on the console home and in the digest | E8 |

### First release, added 24 November 2026

| Id | As | I want | So that | Done when | Rules, screens |
| --- | --- | --- | --- | --- | --- |
| TR-53 | a festival crew member on a rota | to take online courses without being a member | I am inducted before my first shift | The presets give `training.course.view` and `training.place.book` to `front-of-house.rostered`; a rostered non-member sees M1 to M4 and M10 to M13; someone not rostered and not a member sees nothing | Question 2; part 6 |
| TR-55 | a training manager | to upload a lesson video to our own Cloudflare Stream | videos stay private and in one place | Upload is offered only with the account and token set; the file goes from the browser to Stream; K10 shows uploading, processing, ready or failed; a longer video than `max-duration` is refused by Stream and shown as failed; publishing refuses a video that is not ready | VD1 to VD3, VD6; K10 |
| TR-56 | a learner | to watch an uploaded video in the lesson | I learn from it on my phone | Playback needs a token that Training signs only for someone who may open the lesson; the token lasts `playback-for`; without the token or account the section says so and can still be reached | VD4, VD5; M10 |
| TR-57 | a theatre | unused videos to be deleted, and any video removable at once | we pay only for what we use and can honour a request to be taken out | The sweep deletes unreferenced videos after `delete-after`, set-wise; a manager can delete now with a confirmation naming the versions; both are audited | VD7, VD8 |
| TR-58 | Practice mode | to know who may practise a scenario | practice is reached only through a course | The fact `training.practice-open` holds for scenario X through a viewable published course naming X, a current record under a version naming X, or being a trainer of such a course; it agrees with M10's practice link | Part 4 |

## Later, added

| Id | Story | Why later |
| --- | --- | --- |
| TR-53 | Moved to the first release (above) | Matt agreed on 24 November 2026 |
| TR-54 | A practice section reached on Practice mode's `core.practice.scenario-completed`, when the scenario has tasks with checks | Practice mode announces it later |

## What other specs' stories wait on these

Festival's crew induction waits on TR-35 and TR-40 to TR-43. Inventory's lending rule waits on TR-23 only, as before. Reports' training report waits on TR-51. FH-51 and TR-49 are built together.
