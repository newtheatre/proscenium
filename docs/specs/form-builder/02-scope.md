# 1. Scope

The form builder is one module, `forms`, that lets a theatre ask its own questions anywhere in the platform without new code. It covers building a form, filling it in, storing and reading the answers, and moving a response through stages, including review. It owns no theatre-specific record: every other module stays the owner of its own data.

## In scope

| Area | What is specified |
| --- | --- |
| Form definition | Pages, questions, repeating groups, side-by-side rows, explanatory content, endings |
| Question types | Text, number, money, date and time, choice, yes or no, email, phone, address, file, rating, consent, and pickers that other modules supply |
| Logic engine | Show, require, route to a page, end early, calculated values and validation, from one definition checked in the browser and on the server |
| Versions | A draft that is edited, published versions that never change, and what happens to answers when a form changes |
| Responses | Drafts and resuming, submission, revisions, windows, caps, one response per person, anonymous responses |
| Workflows | Stages with who may move a response, review with private scores, conflicts of interest, decisions with feedback, actions on an outcome |
| Custom fields | A form attached to a built-in record type and edited in place on that record |
| Placement | How a module offers a place for a form (a slot) and how a theatre attaches one |
| The builder | The editing interface, live preview, test mode, problems panel, templates, import and export |
| Results | The responses table, filters, export, simple charts |
| Privacy | A data class on every question, encryption of special-category answers, retention and erasure |

## Out of scope

- **Season planning.** Placing chosen shows into slots and spaces is a calendar tool, not a form. A proposals round ends here with a decision and, optionally, a created production.
- **Audition slots with a panel calendar, casting offers and rehearsal calls.** A sign-up form with limited places is in scope; the production-management process around it is not.
- **A survey analytics product.** Results are a table, an export and simple counts. Cross-tabulation and weighting are left to a spreadsheet.
- **Marketing consent management.** A consent question records its wording and time; the mailing-list register belongs to Communications.
- **Taking money.** A form can ask the Payments module for a charge. It never handles a card, a reader or the ledger.
- **Editing public content pages.** Forms can be embedded in a content page, but pages remain content in the fork.
- **Live co-editing of one form by two people at once.** The second editor is told and may take over.
- **Product code.** This document holds formats and rules only.

## How this replaces a proposals module

The design paper lists six capabilities under Programming. Five are delivered by a form with a workflow.

| Programming capability | Delivered by |
| --- | --- |
| Proposal windows per season with structured submissions | A form placed on a season, with opening and closing dates |
| Private drafts, locked after the deadline | Draft responses private to the submitter and named collaborators; the closing date locks them |
| Review with private scores and conflict lockout | The review stage (tab 3) |
| A recorded decision with reasons, feedback to proposers | A decision transition with a required reason and a message to the submitter |
| Retention rules for unsuccessful proposals | Retention per form and per outcome |
| A season planner | Not covered. An approved proposal can create a production through an outcome action; placing it in the calendar is core's job |

## Assumptions about other workstreams

These are written to be checked, and each is repeated in tab 4 beside the interface it affects.

| Workstream | This specification assumes |
| --- | --- |
| 1. Foundations | A module manifest that can carry new kinds of declaration: form slots, field types, bindable attributes, respondent facts and outcome actions |
| 1. Foundations | A data-class registry that accepts a column whose class is decided per row, because the theatre chooses the class of each question |
| 1. Foundations | A ruling on how two modules write in one D1 batch. Proposed here: forms hands the host prepared statements |
| 1. Foundations | An application-level encryption helper for special-category values, an events bus, a queue for retried work and an audit service |
| 2. Identity | A stable person identifier, guest and shadow people, groups a theatre defines, abilities scoped to one record, and an erasure and merge procedure that modules take part in |
| 3. Core domain | Record types with stable identifiers (season, production, performance, venue, space), a Files service, a notification centre with versioned templates, and reusable option lists (vocabularies) |
| 4. Box office and payments | A charge-attempt service that accepts an expected total and announces its outcome as an event |
| 6. Interface | The three shells, the list conventions (filters in the address, export, empty states) and the offline write queue |

## What the first release must prove

1. Someone who has never built a form publishes a working joining form in under 15 minutes, unaided.
2. A proposals round runs from opening to decision with no data held outside the platform.
3. The same answers always give the same result in the browser and on the server.
4. Editing a live form never loses or silently reinterprets an answer.
5. Erasing a person removes their answers from every form in the same batch as the rest of their data.
