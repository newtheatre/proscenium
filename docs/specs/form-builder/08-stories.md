# 7. Stories

The backlog has 41 stories: 27 in the first release, which ends with a proposals round run entirely in the platform, and 14 later. Stories are in build order within each release, and each criterion is written to be turned into a failing test first.

## How to read it

- Ids are `FB-` and a number; the hundreds digit groups them: 1 engine, 2 builder, 3 answering, 4 responses and workflow, 5 integration, 6 privacy and operations.
- "Needs" lists stories that must land first. Dependencies on other workstreams are named by workstream.
- The first release sits in the roadmap's phase 4. Matt confirmed on 16 November 2026 that review belongs in it.

## First release

### Engine

**FB-101 A definition is checked against its format.** As a contributor, I want a definition rejected unless it matches the format, so that nothing malformed is ever stored.

1. A definition missing a required part, or with an unknown question type, is refused with the path to the fault.
2. A definition over a size or count setting is refused, naming the setting.
3. Ids are unique within a definition and keys are unique within a form.

**FB-102 Conditions decide what is shown and required.** As an author, I want questions to appear and become required from earlier answers, so that people only see what applies to them. Needs FB-101.

1. Every comparison in tab 3's table gives the stated result for answered, empty and wrong-type inputs.
2. An item inside a hidden page or group is hidden.
3. A hidden question's answer is treated as empty by everything that depends on it.

**FB-103 Routing moves between pages and endings.** As an author, I want to skip pages and end early. Needs FB-102.

1. The first route whose condition holds is taken; with none, the next page.
2. A route to an earlier page is refused at publish.
3. A stopping ending stores nothing and shows its message.

**FB-104 Calculated values.** As an author, I want totals, counts and dates worked out from answers. Needs FB-102.

1. Each function gives the stated result, including for empty inputs.
2. Money never leaves integer minor units, and division rounds once.
3. A circle of calculations is refused at publish, naming the calculations.

**FB-105 Validation with the theatre's own messages.** As an author, I want to set limits and say what is wrong in my own words. Needs FB-101.

1. Each rule type passes and fails at its boundary values.
2. A rule's own message is shown when it fails, and the default when it has none.
3. Rules on a hidden question never run.

**FB-106 The same result in the browser and on the server.** As the theatre, I want one definition checked in both places. Needs FB-102 to FB-105.

1. The shared case set passes in the Worker runtime and in a browser, and a difference fails the build.
2. The server ignores visibility, facts and calculated values sent by the browser.
3. The engine package imports nothing from the platform.

### Builder

**FB-201 Create a form and edit its draft.** As an author, I want to add, edit, reorder and delete questions and pages, with every change saved. Needs FB-101; workstream 6 for the console shell.

1. A change is saved within two seconds without a save button, and survives a reload.
2. A save with a stale `edit_revision` is refused and the author is told who saved last.
3. Reordering works by dragging and by keyboard, and is announced.
4. Undo and redo reverse and restore every change made in the session.

**FB-202 The first-release question types.** As an author, I want the common question types. Needs FB-201.

1. Short and long text, number, money, date, time, single and multiple choice, yes or no, email, phone, address, rating, consent, file upload and explanatory content can each be added, configured, answered and stored.
2. A consent question stores the wording the person agreed to.
3. A file answer is held through Files and is readable only by people who may read the response.

**FB-203 Repeating groups and side-by-side rows.** As an author, I want a group of questions a person can repeat, and two questions on one row. Needs FB-202.

1. A group enforces its least and most entries.
2. A calculation can sum or count across a group's entries.
3. A row falls back to one column at phone width.

**FB-204 Logic written as sentences.** As an author, I want to build a condition by choosing from three pickers and read it back as a sentence. Needs FB-102, FB-201.

1. The first picker offers only earlier questions, calculations and declared facts.
2. The comparison picker offers only comparisons valid for the first choice.
3. The finished sentence appears on the question's card and matches the stored condition.
4. Deleting a question others depend on names them and asks first.

**FB-205 Live preview and test mode.** As an author, I want to see the form as a respondent will, on phone and desktop, and fill it in without keeping anything. Needs FB-201.

1. The canvas reflects a change without a reload.
2. Test mode lets the author answer as a chosen kind of person (not signed in, audience, member, a group).
3. Nothing entered in test mode is stored, counted against a cap or sent to anyone.

**FB-206 The problems list.** As an author, I want to be told what is wrong before I publish. Needs FB-204.

1. Each check in tab 3 is reported with a link to the item.
2. An error blocks Publish; a warning does not.
3. The list updates as the author works.

**FB-207 Publish, with the impact stated.** As an author, I want to publish knowing what my changes do to existing answers and drafts. Needs FB-206.

1. Publishing creates a new immutable version; an update to a published version is refused by the database.
2. Each change is classed safe, caution or breaking as tab 3 defines, and the summary is shown before confirmation.
3. A breaking change names each retired question and how many answers it holds, and needs a second confirmation.
4. A question's type cannot be changed once published.

**FB-208 Templates.** As an author, I want to start from a working example. Needs FB-207.

1. Each shipped template passes the problems list with no error.
2. A form made from a template is independent of it.
3. A theatre can save a form as its own template and start from it.

### Answering

**FB-301 Place a form on a link.** As a publisher, I want a link with an audience, dates, a cap and one response each. Needs FB-207; workstream 2 for audiences.

1. A person outside the audience is told why and what would let them through.
2. A submission before opening or after closing is refused on the server.
3. With a cap of n, n + 1 simultaneous submissions store exactly n.
4. With one response each, two simultaneous submissions by one person store exactly one.

**FB-302 Fill in and submit.** As a respondent, I want to answer page by page and submit. Needs FB-106, FB-301; workstream 6 for the public and members' shells.

1. Errors are listed at the top with links, and focus moves there.
2. Submission is one unit of work: response, answers, counts, history, audit entry and event are stored together or not at all.
3. Sending the same submission twice stores one response.
4. Answers to hidden questions are not stored.

**FB-303 Save a draft and come back.** As a respondent, I want to stop and resume. Needs FB-302.

1. A signed-in person's draft is restored on any device, at the page they left.
2. A person not signed in finds their draft on the same device, and can request an emailed link.
3. A draft blob is unreadable in the database without the application key.
4. A draft untouched for the setting's period is deleted after one reminder.

**FB-304 My forms.** As a respondent, I want to see what I have submitted and its status. Needs FB-302.

1. The list appears in the audience account and the members' area, and an audience member is never sent to a members' screen.
2. Each response shows the status wording the form defines for submitters, not the internal stage name.
3. A person can download their own answers and withdraw a response that is not final.

### Responses and workflow

**FB-401 The responses table and one response.** As staff, I want to read responses, filter them and open one. Needs FB-302.

1. Columns span versions; a retired question is marked.
2. Filters are held in the address and reproduce the same view when shared.
3. A restricted answer shows as restricted without `forms.response.read-special`, and each reveal is audited.

**FB-402 Export.** As staff, I want the current view as CSV. Needs FB-401.

1. The export matches the filtered view, built on the queue in pages.
2. It needs `forms.response.export`, is audited, and expires after the setting's period.
3. Special-category answers are left out unless the person holds `read-special` and asks for them.

**FB-403 Stages and transitions.** As an author, I want responses to move through stages I define, with rules for who may move them. Needs FB-401.

1. A transition not allowed from the current stage, or by this actor, is refused on the server.
2. A stage change writes its history row, audit entry and event in the same unit of work.
3. Nobody can move their own response.
4. A response keeps the workflow of its own version.

**FB-404 Return for changes, and revisions.** As staff, I want to send a response back, and see what changed when it returns. Needs FB-403.

1. The submitter can edit only while the response is in a returned stage, or as the placement allows.
2. Resubmitting creates a new revision and leaves earlier revisions unchanged.
3. Staff can compare two revisions.

**FB-405 Review with private scores.** As a chair, I want reviewers to score against criteria without seeing each other's scores. Needs FB-403; workstream 2 for groups.

1. Entering a review stage creates one assignment per reviewer.
2. Before release, a reviewer can read only their own review, on every route.
3. After release, the panel sees the summary with mean, spread and weighted total.
4. Scores and reviewer comments are absent from every submitter-facing response.

**FB-406 Conflicts of interest.** As a reviewer, I want to declare a conflict and be locked out, and as the theatre I want obvious conflicts caught without anyone declaring them. Needs FB-405.

1. Declaring a conflict removes the reviewer's access to that response at once, and records the declaration.
2. A reviewer who submitted the response, is a co-author of it or is named in a "people involved" question is conflicted automatically.
3. A conflicted person is refused by every route that returns anything about that response, including lists, search, exports and summaries, whatever role they hold, the Owner included.

**FB-407 Decide, with a reason and a message.** As a decision-maker, I want to approve or decline with a recorded reason and separate feedback. Needs FB-405.

1. A decision requires `forms.response.decide` and a reason where the form says so.
2. The message to the submitter is previewed and sent through the notification centre; the reason is not sent.
3. One transition can be applied to several responses, each audited separately.

### Privacy

**FB-601 A data class on every question, and erasure.** As the theatre, I want every answer classed so erasure works on forms as on built-in data. Needs FB-302; workstream 1 for the registry.

1. A question cannot be saved without a class, and the builder proposes one from its type.
2. Erasing a person treats each of their answers by its class, in the same unit of work as the rest of the erasure, and removes their drafts and files.
3. A special-category answer is stored only as ciphertext.
4. The privacy record lists every question that holds personal data, with its form and retention.

**FB-602 Retention.** As the theatre, I want responses anonymised when their time is up. Needs FB-601.

1. A form with personal questions cannot be published without a retention period while the setting requires it.
2. The sweep anonymises a response once its date has passed, and not before.
3. Declined responses use their own period where one is set.

## Later

| Id | Story | Needs |
| --- | --- | --- |
| FB-501 | Slots: a module declares a place for a form and a theatre attaches one, with the slot's restrictions applied in the builder | Foundations' points; the first host |
| FB-502 | The slot renderer and `addResponse`: a host saves its own record and the answers in one unit of work | FB-501 |
| FB-503 | Custom fields: a form in record mode on a production, a person and a venue, edited on the record's page, with revisions | FB-501; workstream 3 |
| FB-504 | Picker questions: person, production, performance and space, contributed by their modules | Foundations' points; workstreams 2 and 3 |
| FB-505 | Bindings: an answer prefills from and updates an attribute of the person's record, on submission or on a chosen stage | FB-403; workstream 2 |
| FB-506 | Outcome actions: an approved response creates a production, with answers mapped to its fields, exactly once | FB-407; workstream 3 |
| FB-507 | Limited options: a choice whose options each have a number of places, enforced by database constraint | FB-302 |
| FB-508 | Payment: a form ends in a charge for a fixed or calculated amount, and is submitted when the charge succeeds | Workstream 4 |
| FB-509 | Embedding a form in a content page by a content component | FB-301; workstream 3 |
| FB-510 | Import and export of a form as a file, and module-contributed templates | FB-208 |
| FB-603 | Anonymous forms with one response each, by the participation register | FB-301 |
| FB-604 | Invitations: a form open only to invited people, by person or by address | FB-301 |
| FB-605 | Results charts: counts per option and averages for numbers and ratings | FB-401 |
| FB-606 | A shared draft: the submitter adds named people as co-authors of a draft, for a proposal written by a team; it ends when the draft is submitted | FB-303; workstream 2 |

## Order across workstreams

- FB-101 to FB-106 depend on nothing outside the module and can start as soon as the repository and test harness exist.
- The builder and the filler need the shells from workstream 6 and sign-in from workstream 2.
- The integration stories wait for hosts. FB-503 on a production can follow workstream 3's first release; `box-office.checkout-questions` is added to the box office after both exist, so the box office never waits for forms.
- Without FB-506, a proposals round ends in a recorded decision and someone creates the production by hand. That is acceptable for a first release and is why FB-506 is not in it.
