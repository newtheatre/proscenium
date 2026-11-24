# 5. Screens

Training goes from 18 screens to 23: four new in the members' area (a lesson, a quiz, declaring experience, and a competency's "how to get it" page) and one in the console (the lesson editor). Nine existing screens change. Every screen is still one of Interface's page types, and the learner's screens are built for a phone first, since that is where an online induction is taken.

## Members' area: new

| Screen | Address | Page type | Shows | Primary action |
| --- | --- | --- | --- | --- |
| M10 A lesson | `/members/training/courses/<slug>/steps/<step id>` | Steps | One section at a time: its title, body, video, or practice link; a progress line "3 of 5"; the section list in a drawer | "Next", or "Done" on the last section |
| M11 A quiz | the same address, for a quiz step | Form, then Record | The pinned form's questions; then the result: score, pass or fail, and answers as `show_answers` allows | "Send answers"; after a fail, "Try again" or the time it opens |
| M12 Declare experience | panel over M3 or M5 | Form | Statement, where, when, an optional link, referee and file, and the step's own questions | "Send for approval" |
| M13 A competency | `/members/training/competencies/<slug>` | Record | "How to become a First aider": each route as a card in order, with what I already have ticked and the next action per item | The nearest route's next action |

## Members' area: changed

| Screen | Change |
| --- | --- |
| M1 Training | New cards: "Carry on with Fire safety, 3 of 5 sections"; "You can try the Till quiz again from 18:00"; "Your declaration for Sound desk was not approved: see why". A home-page requirement refusal elsewhere links to M13 |
| M2 Courses | Each row shows its ways to learn as words ("Online", "In person", "On shift", "From outside"); a filter by them. Competencies are listed above courses when the person lacks one a host has asked about |
| M3 A course | The Steps tab gives each step its own action by kind: "Start the lesson", "Take the quiz", "Declare your experience", "Send a certificate", "Shadow a shift" (links to Front of house's sign-up with the duty filtered), "Sign up for a session" |
| M5 My training | Lists declarations beside certificates under "Evidence I sent", each with its state and any reason |
| M6 Add a certificate | Where the step lists recognised qualifications, a searchable dropdown of them first, with "Something else" only when allowed |
| M7 Teaching | A list "Used their quiz attempts" for courses I train, each with "Allow another try". Shadowed shifts confirmed this week, for information |

## Console: new

| Screen | Address | Page type | Shows | Primary action |
| --- | --- | --- | --- | --- |
| K10 Lesson editor | `/console/training/courses/<id>/steps/<step id>/lesson` | Editor | Sections in a sortable list (drag and drop with `@dnd-kit/vue`); each opens with a title, a Markdown text area with a preview, an image, a video (an address core's player accepts, or an upload to Stream showing its state), or a scenario picker; "This section has changed" on a copied section; a phone-width preview | "Save"; the course's own "Publish" stays on K2 |

## Console: changed

| Screen | Change |
| --- | --- |
| K1 Courses | A "Ways to learn" column |
| K2 A course | The step editor adds the four kinds. Quiz: a form picker limited to the `training.quiz` slot, with "Create a quiz" from the template, and attempts, wait and show-answers fields (shown only when changed from the defaults, by the forms convention of hiding rarely changed defaults). Activity: a source dropdown, then the source's own picker. Certificate: the recognised qualifications list. Declaration: an optional questions form. A new tab "Results" for a course with quizzes: attempts, first-attempt pass rate per quiz, and who is locked out |
| K5 People | A "Held through" column for competency filters (R11) |
| K8 A competency | The courses list becomes a Routes editor: routes as cards in order, each with items (a course, or a recognised requirement picked from the sources' options), "Add a route", drag to reorder, retire. Saving shows holders before and after (R9) |
| K9 Evidence to check | Certificates and declarations in one queue, oldest first, with a kind filter. A declaration's panel shows the statement, dates, link, referee, file and answers, with "Approve" and "Not approved" (reason required) |

## Outlines

*[Drawing: wireframe · M13 A competency, on a phone]*

*[Drawing: wireframe · M10 A lesson and M11 A quiz, on phones]*

*[Drawing: wireframe · K8 A competency, routes editor, in the console]*

These show layout and wording, not visual design; colours and type come from the theatre's branding through Interface's components.

## Status words, added

| Badge | Means |
| --- | --- |
| In progress, 3 of 5 sections | Part-way through a lesson |
| Passed, 9 of 10 | A passed quiz |
| Try again from 18:00 | Attempts used up, with the time they reopen |
| Waiting for approval | A declaration sent |
| Not approved | A declaration or certificate rejected; the reason is one tap away |
| Through an outside certificate | How a held competency is held, on M13 and K5 |

## Empty, refused and failed, added

| Screen | State | Wording |
| --- | --- | --- |
| M10 | Practice scenario not available | "This practice isn't available at the moment. You can carry on." with "Next" |
| M10 | Video will not load | "The video won't load here. It is at <address>." The section can still be passed |
| M11 | Attempts used up | "You've used your 3 tries. You can try again from 18:00 tomorrow, or ask a trainer for Till." |
| M11 | Sent twice at once | The second is refused and the first result shown |
| M12 | Own decision | "This is your own declaration. Somebody else must decide it." (K9) |
| K2 | Quiz form without a key or pass mark | "This quiz has no correct answers or pass mark yet. Add them in the form before publishing." |
| K8 | Route naming Training | "A route can't depend on another competency. List its courses instead." |
| Any host | Not met | Training's reason now names routes: "Needs First aider. You could hold it through our course (next session 3 December) or an outside certificate." |

## Accessibility

Lesson sections use real headings; every video plays in core's player (C-64) and needs `video_caption_note` filled before the course can publish (where captions or a transcript are), and the lesson editor says so. Quiz questions are Forms' own components, which already meet the members' area's targets. Results are announced as words, never only by colour.
