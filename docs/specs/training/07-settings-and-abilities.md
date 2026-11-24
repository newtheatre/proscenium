# 6. Settings and abilities

Training gains seven settings, for 24 in all, two credentials, and no abilities: every new act fits one of the fourteen already declared. Two guards are added. Everything in the original part 6 stands, including the settings page at `/console/training/settings`, every setting naming `training.settings.manage`, and durations entered with `DurationInput` and labelled without a unit.

## Settings, added

| Key | Kind | Default | Limits | Audience | Purpose |
| --- | --- | --- | --- | --- | --- |
| `training.quizzes.default-max-attempts` | integer (attempts) | 3 | 1 to 20, or empty for no limit | staff | The attempts offered for a new quiz step. Each step's own value is what counts |
| `training.quizzes.retry-after` | duration | 1d | 10m to 30d | signed-in | How long after the attempts are used up a person can try again, offered for a new quiz step |
| `training.evidence.chase-after` | duration | 7d | 1d to 60d | staff | When a certificate or declaration still waiting is shown on the console home and in the digest |
| `training.lessons.video-hosts` | list of host names | `www.youtube-nocookie.com`, `player.vimeo.com` | at most 10; each a host name | staff | Withdrawn 24 November 2026: core's core.video.player-hosts (C-64, VL1) is the one list of allowed hosts |

None declares `onChange`: none of them changes a training record already held.

### Uploaded video, added 24 November 2026

| Key | Kind | Default | Limits | Audience | Purpose |
| --- | --- | --- | --- | --- | --- |
| `training.videos.stream-account` | text | unset | a Cloudflare account id | staff | The account whose Stream holds uploaded videos. Unset means no uploads (VD1) |
| `training.videos.max-duration` | duration | 30m | 1m to 6h | staff | The longest video Stream will accept for one upload |
| `training.videos.playback-for` | duration | 2h | 10m to 24h | internal | How long one signed playback token lasts (VD4) |
| `training.videos.delete-after` | duration | 90d | 7d to 2y | staff | How long an unused video is kept before the sweep deletes it (VD7) |

| Credential | Entered by | Manage | Note |
| --- | --- | --- | --- |
| `training.stream-token` | A person, on Training's settings page through the kit's keys card | `training.settings.manage`, with confirm | A Cloudflare API token with Stream edit permission on that account. Never a Worker secret |
| `training.stream-signing-key` | Training itself, on the first upload (VD4) | Not editable; cleared with the token | Stream's signing key for playback tokens; never shown |

The four sit in group `videos` on Training's page, with the minutes stored (VD9) beside them. Removing the token keeps every row and turns playback off (VD5) until a token is saved again.

## Rules across settings, added

| Rule id | Check |
| --- | --- |
| `retry-inside-progress` | `quizzes.retry-after` is shorter than `progress.complete-within`, so a locked-out learner can still finish in time |

The course service also refuses a quiz step whose own `retry_after` is not shorter than the progress window, since the registry's rules cover settings only.

## Abilities: who does the new things

| New act | Ability | Why it fits |
| --- | --- | --- |
| Write lessons, attach a quiz or a declaration form, choose an activity source, list recognised qualifications | `training.course.manage` at the course | All are editing a course version's steps |
| Create the quiz or declaration form itself | Forms' own `forms.form.manage`, as for any form; the slot limits where it can be used | Forms owns forms |
| Add, reorder or retire routes; add recognised items | `training.competency.manage` (privileged) | Changes who meets every requirement that names the competency, exactly as changing its courses did |
| Take a lesson or a quiz, declare experience | No ability beyond `training.course.view`; own rows, signed-in routes that only touch the caller's rows | A person's own progress, as before |
| Allow another quiz attempt | `training.sign-off.record` at the course | The trainer who signs people off is the person who judges whether to let them try again |
| Approve or reject a declaration | `training.evidence.verify` at the course | One queue for evidence to check; a welfare lead can be given safeguarding courses only, as before |
| See attempts and results on K2 | `training.record.view` at the course, reads audited | It shows who has and has not passed |
| Use a practice section | `core.practice.use` at the scenario, through Training's fact training.practice-open (Practice mode's question 3, 24 November 2026) | Practice mode's |

The suggested holders and preset mappings are unchanged. Matt agreed (question 2) that the presets also give `training.course.view` to rostered volunteers.

## Guards that are not abilities, added

| Guard | Refusal code | Where |
| --- | --- | --- |
| Nobody allows themself another quiz attempt | `training.own-allowance` | Part 3, Q6 |
| Nobody approves their own declaration | `training.own-evidence`, unchanged | S4, now covering declarations |
| An activity occurrence confirmed by its own subject does not count | none: skipped, not refused, since nobody acted | H3 |
| A route never names Training | `training.route.self-reference` | R7 |
| A quiz over its limit is refused | `training.quiz.limit`, with when it reopens | Q3 |
| A course cannot pin a quiz form without a key and pass mark | `training.quiz.not-marked` | Q1 |

## Record types and facts

Unchanged. Routes, sections and attempts are reached through their competency or course and need no record type of their own: a route is audited against `training.competency`, sections and attempts against `training.course`.
