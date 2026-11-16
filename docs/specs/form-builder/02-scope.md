# 1. Scope

The form builder is one module, `forms`, that lets a theatre ask its own questions anywhere in the platform without new code. It covers building a form, filling it in, storing and reading the answers, and moving a response through stages, including review. It owns no theatre-specific record: every other module stays the owner of its own data.

## In scope

| Area | What is specified |
| --- | --- |
| Form definition | Pages, questions, repeating groups, side-by-side rows, explanatory content, endings |
| Question types | Text, number, money, date and time, choice, yes or no, email, phone, address, file, rating, consent, and pickers that other modules supply. The paper also lists a signature: it is not in the first release and has no story yet, so it is recorded here as later. The paper's "sections" are this specification's pages and repeating groups |
| Logic engine | Show, require, route to a page, end early, calculated values and validation, from one definition checked in the browser and on the server |
| Versions | A draft version that is edited, published versions that never change, and what happens to answers when a form changes |
| Responses | Draft responses and resuming, submission, revisions, windows, caps, one response per person, anonymous responses |
| Workflows | Stages with who may move a response, review with private scores, conflicts of interest, decisions with feedback, actions on an outcome |
| Custom fields | A form attached to a built-in record type and edited in place on that record |
| Placement | How a module offers a place for a form (a slot) and how a theatre attaches one |
| The builder | The editing interface, live preview, test mode, problems panel, templates, import and export |
| Results | The responses table, filters, export, simple charts |
| Privacy | A data class on every question, encryption of special-category answers, retention and erasure |

## Out of scope

- **Season planning.** Placing chosen shows into slots and spaces is a calendar tool, not a form. A proposals round ends here with a decision. In the first release someone then creates the production by hand; an outcome action that creates it follows (Matt's decision, tab 9).
- **Audition slots with a panel calendar, casting offers and rehearsal calls.** A sign-up form with limited places is in scope; the production-management process around it is not.
- **A survey analytics product.** Results are a table, an export and simple counts. Cross-tabulation and weighting are left to a spreadsheet.
- **Marketing consent management.** A consent question records its wording and time; the mailing-list register belongs to Communications.
- **Taking money.** A form can own a part of a Payments intent, after the first release. It never handles a card, a reader or the ledger.
- **Editing public content pages.** Forms can be embedded in a content page, but pages remain content in the fork.
- **Live co-editing of one form by two people at once.** The second editor is told and may take over.
- **Product code.** This document holds formats and rules only.

## How this replaces a proposals module

The design paper lists six capabilities under Programming. Five are delivered by a form with a workflow.

| Programming capability | Delivered by |
| --- | --- |
| Proposal windows per season with structured submissions | A form placed on a season, with opening and closing dates |
| Private draft responses, locked after the deadline | Draft responses private to the submitter; the closing date locks them. Co-authors the submitter adds follow the first release |
| Review with private scores and conflict lockout | The review stage (tab 3) |
| A recorded decision with reasons, feedback to proposers | A decision transition with a required reason and a message to the submitter |
| Retention rules for unsuccessful proposals | Retention per form and per outcome |
| A season planner | Not covered. An approved proposal can create a production through an outcome action; placing it in the calendar is core's job |

## What this specification relies on from other workstreams

The first draft listed these as assumptions. Each has since been settled with its owner, and tab 4 has the detail beside the interface it affects.

| Workstream | Forms relies on | State |
| --- | --- | --- |
| 1. Foundations | Points and contributions in the manifest, which carry form slots, field types, bindable attributes, outcome actions and templates | Settled |
| 1. Foundations | A data-class registry that accepts a column whose class is decided per row, because the theatre chooses the class of each question | Settled |
| 1. Foundations | The unit of work: a host and forms add statements to one D1 batch, and neither commits alone | Settled |
| 1. Foundations | Encryption for special-category values, events with an internal flag for webhooks, the queue, the audit service, and scoped ids with links as separate tokens | Settled |
| 2. Identity | The account as the person, the email subject for a signed-out respondent, roles granted on one form, facts that allow and never deny, and erasure and merge that move forms' columns | Settled |
| 3. Core domain | Record types (season, production, performance, venue, space), files, notification types and vocabularies | Settled |
| 4. Box office and payments | Payments' collect service and its settlement point, which any module may use as the owner of an intent part | Open; not needed for the first release |
| 6. Interface | The three shells, the Editor layout, the list conventions and the form rules | Settled |

## What the first release must prove

1. Someone who has never built a form publishes a working joining form in under 15 minutes, unaided.
2. A proposals round runs from opening to decision with no data held outside the platform.
3. The same answers always give the same result in the browser and on the server.
4. Editing a live form never loses or silently reinterprets an answer.
5. Erasing a person removes their answers from every form in the same batch as the rest of their data.
