# 9. Questions for Matt

Matt answered all nine on 24 November 2026. Eight follow the recommendation. Question 4 does not: lesson videos may also be uploaded to the theatre's Cloudflare Stream, which parts 2, 3, 4, 6, 7 and 8 now cover (rules VD1 to VD9, stories TR-55 to TR-57). Your ten rulings of 16 November 2026 are not reopened.

| # | Matt's answer, 24 November 2026 | Effect |
| --- | --- | --- |
| 1 | A route item, checked live | As written |
| 2 | Yes: anyone on a rota (`front-of-house.rostered`) can take online courses | TR-53 moves into the first release as a preset change |
| 3 | Complete when every section is reached | As written |
| 4 | **Also Cloudflare Stream uploads** | Upload, private playback, deletion and a credential added: VD1 to VD9, `training_videos`, four settings and two credentials, TR-55 to TR-57; every video now plays in core's one player (C-64), so Training's own video hosts setting is withdrawn |
| 5 | Three failures a day, then wait | As written |
| 6 | Right answers shown after passing | As written |
| 7 | The course's verifiers, in the evidence queue | As written |
| 8 | As long as the course says | As written |
| 9 | The shift lead ticks shadowed shifts | As written; FH-51 stands |

Two rulings from other specs also touch Training. Practice mode is reached only through a Training course (Practice mode question 3), so Training declares the fact `training.practice-open` (part 4, TR-58). Productions positions can require training from the first release, as hosts of `core.requirement` under TR-23, with no change to Training.

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | Is "recognised elsewhere" a route item or a step? | A route item, checked live |
| 2 | May rostered volunteers who are not members take online courses? | Yes, through the rostered fact |
| 3 | When is an online lesson complete? | Reaching the end; nothing timed |
| 4 | Where do lesson videos live? | Embedded from allowed hosts only |
| 5 | How are quiz attempts limited? | Three failures, then a day's wait |
| 6 | When does a learner see the right answers? | After passing |
| 7 | Who approves declarations, and where? | The course's verifiers, in Training's evidence queue |
| 8 | How long does training earned by declaration last? | As long as the course says |
| 9 | Does a shadowed shift need the lead to confirm it? | Yes |

## 1. Is "recognised elsewhere" a route item or a step?

The map doc proposed it as a step kind. Written out, a step is the wrong place: a step that passes writes a sign-off and a training record with an expiry, so "is a Tech Crew member" would be copied into Training on the day it was checked and stay true after they leave Tech Crew.

- **(a) Route item, checked live. Recommended.** Nothing is copied. The answer is whatever the other source says at the instant asked, including the future and the past. The route is "Tech Crew member" on its own, or with one of our courses beside it.
- (b) Step kind, as the map proposed. Fits courses that mix it with other steps, but goes stale as above.
- (c) Both. More to explain for little gain.

If (b): the route item kind `recognised` goes, a step kind is added, and TR-37's acceptance changes.

## 2. May rostered volunteers who are not members take online courses?

You ruled on 16 November that training is for members, with staff adding anyone by name. A festival such as StuFF or WSAF puts crew on the rota who are not members, and the online induction is exactly what they need before the first shift. Front of house already declares `front-of-house.rostered` as a standing fact.

- **(a) Map `training.course.view` and `training.place.book` to `front-of-house.rostered` in the presets. Recommended.** Anyone on a rota can see and take courses from the moment they are rostered, and nobody else. No new mechanism; members-only stays true for everyone else.
- (b) Keep members only. Festival crew are made members, or a manager adds each by name.
- (c) A per-course switch "open to anyone signed in". Most open; needs a screen outside the members' area, which you ruled against.

If (a): TR-53 moves into the first release as a preset change.

## 3. When is an online lesson complete?

- **(a) When every section has been reached. Recommended.** Simple, works on any phone, and honest about what it proves. The quiz is what shows understanding.
- (b) A minimum time on each section. Teaches people to wait, and punishes fast readers.
- (c) The video must be played to the end. Embedded players do not report this reliably across hosts, and it would need a host's tracking script.

## 4. Where do lesson videos live?

- **(a) Embedded from allowed hosts only (YouTube's no-cookie address and Vimeo by default). Recommended.** No storage or streaming cost; a theatre usually has its videos on one of these already.
- (b) Also allow uploading to Cloudflare Stream. Stays on Cloudflare and keeps videos private, but adds a per-minute monthly cost and an account setting. Prices were not checked for this question; could be a later story if a theatre asks.
- (c) Short clips uploaded to R2 through core files. Cheap, but no adaptive streaming, so poor on a phone signal.

## 5. How are quiz attempts limited?

- **(a) Three failed attempts in any day, then the quiz waits. Recommended.** Guessing is slowed without anybody having to step in, and a trainer can still allow another try at once. Both numbers are settings and per step.
- (b) Three attempts, then a trainer must allow more. Stricter; puts work on trainers and strands a learner at a weekend.
- (c) No limit. Simplest; a short multiple-choice quiz can then be passed by trying every answer.

## 6. When does a learner see the right answers?

- **(a) After passing. Recommended.** They can learn from what they got wrong without being handed the answers for the next try.
- (b) After every attempt. Kinder, but with (5a) it makes the third try trivial.
- (c) Never. The score only.

The author can choose any of the three per quiz; this is only the default.

## 7. Who approves declarations, and where?

The map suggested the form builder's review stages for the queue. Written out, Training's own evidence queue fits better.

- **(a) Holders of `training.evidence.verify` at the course, in the same queue as certificates (K9). Recommended.** One queue, one rule against deciding your own, one ability a theatre already understands. The approval and the sign-off are one unit. The form builder still asks any extra questions.
- (b) Form builder review stages and an outcome action. Brings multi-person review, but the sign-off happens in a later job, decisions live in two places, and reviewers need form abilities rather than Training ones.
- (c) A separate list of approvers per course. More to set up for the same result.

## 8. How long does training earned by declaration last?

- **(a) As long as the course says, like any other route. Recommended.** "Prior experience" can be a course with a two-year validity, so people re-declare or train before it lapses.
- (b) Never expires. Experience doesn't lapse, but competence on a theatre's own kit can.
- (c) The approver sets it each time, up to the course's limit. Flexible; another field to get wrong.

## 9. Does a shadowed shift need the lead to confirm it?

Agreed in outline with the festival-ready changes as FH-51, pending your view.

- **(a) Yes: the lead ticks "shadowed" when closing the shift. Recommended.** A shift being worked does not show the person learnt anything; the lead's tick is the trainer's judgement, captured where it happens.
- (b) No: any completed shift marked "shadowing" counts. Less work for leads; anyone could tick themselves onto a shift and be signed off.
