# 1. Scope

The amendment widens how a competency can be earned and how a course can be taught. It still answers only one question for the rest of the platform: is this person trained to do this, at this instant, and if not, what would get them there?

## In scope, added

| Area | What the module now does |
| --- | --- |
| Routes | A competency lists one or more routes; any one route holds it. Each route lists items that must all hold |
| Recognised elsewhere | A route item that names another source's requirement, such as a membership scheme or a fact, checked live |
| Online lessons | Short in-app lessons of ordered sections (text, images, an embedded video, a practice-mode scenario), with progress saved per section |
| Quizzes | A form with correct answers and a pass mark, taken inside a course; marked on the server at once; attempts limited |
| Declarations | Experience gained elsewhere, stated by the person with optional evidence, approved by somebody else |
| Recognised qualifications | A certificate step may list the outside qualifications it accepts, so a person picks "Emergency First Aid at Work" rather than typing it |
| Shadowed shifts | A step signed off from shifts worked alongside a lead, reported by Front of house |
| Ways to learn | What a course involves (in person, online, on shift, from outside) is derived from its steps, for the catalogue and filters |
| Figures | Holders, lapsing, completions by route kind, quiz pass rates and session attendance, contributed to `core.measure` |

## In scope, removed or replaced

| Was | Now | Why |
| --- | --- | --- |
| A competency lists courses, all needed (`training_competency_courses`) | Routes and route items | A competency needs more than one way in: our course, or a recognised certificate, or approved experience |
| The course's `delivery` label, set by hand | Derived from the step kinds | A label set by hand drifts from what the steps actually ask |
| TR-27 knowledge check: a form on a reading step, marked by a person, signed off by the outcome action `training.sign-off-step` | The quiz step kind | Automatic marking needs no person; Training hosting the form keeps the sign-off in one unit of work |
| Form slot `training.knowledge-check` | Form slot `training.quiz` | As above |
| Outcome action `training.sign-off-step` | Withdrawn | Nothing needs it: quizzes and declarations are decided inside Training |
| TR-28, later: `training.step-source` | First release, with Front of house's shadowed shift as the first source | Matt asked for it to be brought forward (map doc, Training tab) |

## Still out of scope

| Left out | Why | Where it belongs |
| --- | --- | --- |
| Hosting video | No video storage, transcoding or streaming. A lesson embeds a video from an allowed host | Question 4 asks whether Cloudflare Stream should come later |
| SCORM, xAPI or importing courseware | A volunteer theatre's material is a few pages and a video. A standard brings a runtime and a player for little gain | Not planned |
| Proctoring, timed exams, question banks drawn at random | Stakes are low and the people are known | Not planned; a theatre wanting rotation publishes a new quiz version |
| Grading free text | A person would mark it, which brings back the queue the quiz removes | A declaration step, which a person does decide |
| Practice mode itself | A platform capability | Practice mode (spec 13). Training links to its scenarios |
| The form builder's marking | Forms owns questions and their answer keys | FB-513 (spec 15) |
| Deciding what a shift, a till, a loan or a booking requires, and what an unmet requirement does | Unchanged: the host owns it | Front of house, Bar, Spaces, Inventory |
| Training non-members by default | Ruled on 16 November 2026 (question 2). Question 2 here asks only whether rostered volunteers, such as festival crew, may take online courses | Tab 9 |

## Assumptions about other modules

| Module | Assumed | Agreed |
| --- | --- | --- |
| Forms | A slot in submission mode with no stages can be hosted through `slotForms` and `addResponse` (built). FB-513 adds an answer key and a pass mark to a form version, strips the key from every definition sent to a browser, stores `score`, `out_of` and `passed` on the response, and makes `addResponse` return `marking: { score, outOf, passed, perQuestion }` | Spec 15, 23 November 2026 |
| Front of house | FH-51: an assignment can be marked `shadowing`; the shift lead confirms it on closing the shift; Front of house contributes the source `front-of-house.shadowed-shift` and announces `front-of-house.shadow.confirmed` | Spec 15, 23 November 2026 |
| Practice mode | Scenarios have stable ids `<module>.<name>` through `core.practice-scenario`; `/practice/<scenario id>` opens one; an unknown or switched-off scenario says "This practice isn't available" rather than failing; `core.practice.use` is held by every member | Spec 13, 23 November 2026 |
| Reports | `core.measure` contract: `combine`, `by`, `ratio` | Spec 12, 23 November 2026 |
| Inventory | Module id `inventory`; stores `training:tcmp_…` on categories and items; checks the borrower and the person recording an inspection with `whenUnavailable: 'met'` | Spec 11, 23 November 2026 |
| Core | Lesson section bodies are Markdown columns shown through core's sanitising MarkdownText; there is no rich-text editor, so they are edited in a Markdown text area with a preview. Video is a separate field, checked against training.lessons.video-hosts | Confirmed by Integration, 23 November 2026 |
| The kit | `requirements.check` may be called by a source while it answers another check, so a route item can ask another source. Training refuses training: and fact:training. references, so this never loops; a kit depth limit is on Integration's worklist | Confirmed by Integration, 23 November 2026 |

## Dependencies

| Kind | Module | For |
| --- | --- | --- |
| requires | `forms` | Session sign-up questions, quizzes and declaration questions. Unchanged: forms is always on |
| uses | `front-of-house`, `bar`, `spaces`, `inventory` | Presets only, as before. `inventory` is added now its id is agreed. Front of house's step source is reached through the point and needs no `uses` entry |

## Glossary: new and changed words

| Word | Meaning |
| --- | --- |
| Route | One way to hold a competency. A competency holds when any of its routes holds |
| Route item | One condition in a route: a current training record for a course, or a recognised requirement. Every item of a route must hold |
| Recognised elsewhere | A route item that names another source's requirement, such as "Tech Crew member", and is checked live. No training record is written for it |
| Recognised qualification | An outside qualification a certificate step accepts, chosen from the step's list |
| Way to learn | What a course's steps involve, shown on the catalogue: in person, online, on shift, from outside. Derived, never set |
| Online lesson | A step made of ordered sections the person reads or watches in the app |
| Section | One page of an online lesson |
| Quiz | A step answered by a form with correct answers and a pass mark, marked on the server at once |
| Attempt | One submission of a quiz, with its score and whether it passed |
| Declaration | A step where the person states experience gained elsewhere, with optional evidence, for somebody else to approve |
| Evidence | Widened: a certificate or a declaration, held for checking. Both are "evidence to check" in one queue |
| Shadowed shift | A shift worked alongside a lead who confirmed the person shadowed them. A step can require one or more |
| Step source | Another module's activity that can sign a step off, contributed through `training.step-source` |

"Knowledge check" leaves the glossary. Words used from others: answer key, marking, pass mark (Form builder, FB-513); scenario (Practice mode); measure (Reports); assignment, shadowing (Front of house).
