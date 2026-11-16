# 5. Screens

The module has 21 screens: 9 for people who build and run forms, 5 for people who review and decide, 4 for people who answer, and 3 components that appear inside other modules' screens. The builder is the one that decides whether the module succeeds, so it is specified most closely.

## Inventory

Shells are the paper's three: public, members' area and console. Workstream 6 owns their layout; these screens sit inside them.

| # | Screen | Shell | Purpose | Who sees it |
| --- | --- | --- | --- | --- |
| 1 | Forms list | Console | Every form the person may see, with status, open responses and what needs attention | Any forms ability |
| 2 | New form | Console | Start blank, from a template, or by importing a file | `forms.form.create` |
| 3 | Builder: Questions | Console | Build and edit the draft | `forms.form.edit` |
| 4 | Builder: Workflow | Console | Stages, transitions, review set-up, outcome actions | `forms.form.edit` |
| 5 | Builder: Settings | Console | Mode, anonymity, retention, messages, payment | `forms.form.edit` |
| 6 | Preview and test | Console | Fill the draft in as a chosen kind of respondent; nothing is kept | `forms.form.edit` |
| 7 | Publish | Console | The change summary, its impact, and confirmation | `forms.form.publish` |
| 8 | Share and place | Console | The link, embed code, audience, dates, cap, and slots the form is attached to | `forms.form.publish` and the slot's ability |
| 9 | Version history | Console | Each published version, who published it, what changed; open any version read-only | `forms.form.edit` |
| 10 | Responses table | Console | All responses with filters in the address, columns per question, export | `forms.response.read` |
| 11 | Response | Console | One response: answers by revision, status, history, messages, actions | `forms.response.read` or a reviewer |
| 12 | Review queue | Console or members' area | The responses waiting for this reviewer | `forms.review.score` |
| 13 | Review summary | Console | Scores side by side after release, and the decision | `forms.review.chair` or `forms.response.decide` |
| 14 | Results charts | Console | Counts and averages per question | `forms.response.read` |
| 15 | Fill in a form | Public or members' area | Answer, page by page, with saving and resuming | The placement's audience |
| 16 | Confirmation | Public or members' area | What was received, the reference, what happens next | The submitter |
| 17 | My forms | Audience account and members' area | Drafts to finish and responses with their status | Any signed-in person with one |
| 18 | My response | Audience account and members' area | Own answers, status, messages from the theatre, revise or withdraw | The submitter |
| 19 | Slot renderer | Inside a host's screen | The attached form's questions inline, such as at checkout | Whoever the host shows it to |
| 20 | Record-fields panel | Inside a host's screen | Custom fields on a record, to view and edit | The host record's abilities |
| 21 | Attach a form | Inside a host's settings screen | Choose or create the form for a slot | The slot's ability |

Two placements deserve a note. A reviewer who is an ordinary member, not staff, meets screens 11 and 12 in the members' area, so reviewing never requires console access. And screens 17 and 18 appear in the audience account as well as the members' area, because an audience member can fill in a form and must never be sent to a members' screen to find it. Each response opens in the shell it was answered in.

## The builder

&#91;embedded content: Wireframe: the builder on a laptop, with the third question selected\]

The builder uses the platform's Editor layout, which Workstream 6 added for it: an outline, a canvas, a panel and tabs in the top bar.

Three regions on a laptop, one at a time on a phone.

| Region | Holds | Behaviour |
| --- | --- | --- |
| Outline, left | Pages and their questions as a tree | Click to jump. Drag to reorder or move between pages, with Move up, Move down and Move to page as keyboard and menu equivalents |
| Canvas, centre | The form as the respondent will see it, in the theatre's branding | Click a question to select it and edit its wording in place. An Add button between any two items opens the question picker. A toggle switches between phone and desktop widths |
| Panel, right | The selected question, in four parts: Question, Logic, Checks, Data | Changes show on the canvas at once and save by themselves |

The top bar holds the form's name, the tabs Questions, Workflow and Settings, a saved indicator, undo and redo, Problems with a count, Preview, and Publish.

### What each part of the panel holds

| Part | Holds |
| --- | --- |
| Question | Type, label, help text, options, whether required, default or prefill |
| Logic | "Show this question when…" and "Require this question when…", written as sentences |
| Checks | Validation rules, each with its message |
| Data | The key used in exports, the data class with a plain explanation, restricted or not, and the attribute it updates, if any |

### Logic as sentences

The paper requires logic to be read as plain sentences, never a rule table. A condition is assembled from three pickers that read left to right, and the finished sentence stays on the question's card on the canvas.

> Show this question when **Which role are you proposing for?** is **Director**

> Show this page when **all** of these are true: **Budget requested** is more than **£500**, and **the person answering** is a **current member**

> After this page, go to **Technical requirements** when **Does the show need rigging?** is **Yes**; otherwise continue

- The first picker lists only what the condition may refer to: earlier questions, calculations, and facts about the person or the attached record. A later question cannot be chosen, so the commonest logic error cannot be made.
- The second picker offers only the comparisons that suit the first.
- The third is the right control for the type: the question's own options, a date picker, a money field.
- Routing is edited at the foot of each page, where it takes effect, not in a separate list.
- A question that something else depends on shows a small marker, and its panel lists what depends on it. Deleting it asks first and names them.

### What makes it usable

The reference project is described by its author as not very usable. These behaviours are requirements with a test each (tab 8).

| Requirement | Behaviour |
| --- | --- |
| Nothing is lost | Every change saves by itself within two seconds. A failed save is shown and retried; the editor is never left unsure |
| Mistakes are cheap | Undo and redo cover every change in the session, including deletes and moves |
| The draft is safe to play with | Edits never touch the live form until Publish |
| Problems are found before respondents find them | The Problems list updates as the author works; each problem links to its question |
| Consequences are stated before they happen | Publish shows what changed and what it does to drafts and existing answers, in words |
| Starting is easy | Templates for the common forms, each a complete working example |
| Testing is safe | Preview fills in the form for real, as a chosen kind of person, and discards everything |
| Common things are one step | Duplicate a question or page; turn two questions into a side-by-side row; convert a list of pasted lines into options |
| It works without a mouse | Every action has a keyboard path, and reordering is announced to screen readers |
| Two authors do not collide | The second person to open a draft sees who is editing and may view read-only or take over |

### Templates shipped with the first release

| Template | Slot | Shows off |
| --- | --- | --- |
| Show proposal | `core.season-call` | Pages, a repeating team list, a budget total, review with criteria, a decision with feedback |
| Joining form | `membership.application` | Bindings to the person's record, a consent question |
| Audition or workshop sign-up | `core.production-signup` | Limited options, one response each |
| Questions at checkout | `box-office.checkout-questions` | A short inline form with no pages |
| Access requirements | `forms.link` | Special-category questions, restricted reading |
| Room booking extras | `spaces.booking-extras` | Conditional questions |
| Incident report | `front-of-house.incident-report` | Staff-only questions, routing by severity |
| Feedback survey | `forms.link` | An anonymous form, ratings |
| Expense claim | `finance.expense-claim` | File upload, a calculated total, an approval stage |
| Production details | `core.production-fields` | Custom fields in record mode |

## Filling in a form

- **One page at a time**, with the page title, a progress indicator and Back and Continue. A short form with one page shows no progress indicator.
- **Errors** appear when the person leaves a field and again on Continue, in a summary at the top that links to each field. Focus moves to the summary.
- **Saving.** A signed-in person's draft saves to the server as they go, and "Saved" is shown. A person who is not signed in has the draft kept on their device, and may ask for a link by email to continue elsewhere.
- **A dropped connection** is said plainly. Answers stay on the device, and Submit is held and retried, never sent twice.
- **Calculated values** such as a total appear in place and update as answers change.
- **A review page** before Submit lists the answers by page with a Change link for each, when the form has more than one page.
- **Closed, full or not for you.** A form that cannot be answered shows only why, and what would let the person through: sign in, join, or come back when it opens.
- **Accessibility.** Each question is one labelled control with its help text attached. Groups of choices are grouped and named. No question depends on colour, dragging or a time limit. This follows the paper's WCAG 2.2 AA rule.

## Reviewing and deciding

&#91;embedded content: Wireframe: one response in review, and the locked row a conflicted reviewer sees\]

The review queue appears in the navigation of both the members' area and the console, and a response in review is the same record page under either, so a reviewer is never sent to a shell they do not otherwise use.

- **The review queue** lists what is waiting for this reviewer, oldest first, with how many they have done.
- **A response in review** shows the answers on the left and the reviewer's own scoring panel on the right: each criterion with its guidance and scale, a private comment, a recommendation, and Submit review.
- **Declare a conflict** is always visible on that panel. Using it replaces the response with a notice at once.
- **A conflicted reviewer** sees the response in their queue as a locked row that names the form and nothing else.
- **The summary** appears to the chair after release: one row per response, a column per criterion with the mean and the spread, the number of reviews, and the weighted total. Selecting a row shows each reviewer's scores and comment.
- **Deciding** opens a dialog with the transition's name, a reason for the record, and a separate message to the submitter with a preview of what they will receive.
- **Several at once.** The chair may select several responses and apply one transition, with one message template; each is still its own audited change.

## The responses table

Follows the platform's list conventions: filters live in the address, every view can be linked to and exported, and an empty table says what would fill it.

- One row per response, with reference, submitter, submitted time, stage and a column per question. Retired questions are grouped at the right and marked.
- Restricted answers show as "restricted". Uploaded files show as a count that opens the response.
- Filters by stage, date, version, and any choice, number or date question.
- Export to CSV of the current view. An export that would include personal answers names the retention period in its confirmation, and is audited.

## Screens inside other modules

- **The slot renderer** draws the attached form's questions inline in the host's own form, with the host's Submit button. The host asks forms to check the answers and adds them to its own unit of work, so the order and its answers are saved together or not at all.
- **The record-fields panel** shows custom fields as a section of the host's record page, read-only until the host's own Edit is used.
- **Attach a form** lists the forms that fit the slot, offers the slot's template, and opens the builder with the slot's restrictions applied.
