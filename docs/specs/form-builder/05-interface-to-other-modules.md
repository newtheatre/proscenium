# 4. Interface to other modules

Other modules meet the form builder in five places: they offer slots where a form can sit, supply picker question types, expose attributes an answer can update, expose actions an outcome can run, and call a small set of services. Forms never writes another module's tables and never names another module in its own code.

This tab follows the formats in the foundations draft ([Module manifest](https://claude.ai/artifact/RKRTkLkrG98jXHSBptUc1x), read 16 November 2026): points and contributions, facts, units of work, and its naming rules.

## Points forms offers

| Point | Kind | A contribution is | Example contributor |
| --- | --- | --- | --- |
| `forms.slot` | data | A place a form can be attached: id, the record type it is about, mode (`submission` or `record`), who answers, how many forms it takes, and the abilities that may attach one | Box office: questions at checkout for a ticket type. Core: custom fields on a production |
| `forms.field-type` | code | A picker question type: search for candidates the respondent may see, check an id is valid, give its label | Core: person, production, performance, space. Inventory: item |
| `forms.bindable` | code | An attribute an answer can prefill from and write to: its type, its data class, a reader, and a writer that adds statements to a unit of work | Identity: phone number, emergency contact. Membership: course and year |
| `forms.outcome-action` | code | Something to do when a response reaches a stage: an input schema the form designer maps answers to, and a runner that is safe to call twice | Core: create a production. Membership: start a membership. Finance: raise an expense claim |
| `forms.template` | data | A ready-made form a module ships: id, the slot it suits, and its definition file | Front of house: incident report |

Rules for every point:

- A contribution is only offered in the builder while its module is switched on. A form that uses one whose module is off cannot be published, and says which module.
- A live form whose picker, binding or action loses its module keeps running: the question shows as unavailable and is skipped, the binding and action wait in `forms_action_runs`. Nothing is lost and nothing is guessed.
- A contributor's reader and search run as the current person, so a picker never reveals a record that person may not see.

## Slots in detail

A slot is how "a form attached to a ticket type" or "custom fields on a production" exists without forms knowing what a ticket type is.

| Slot field | Meaning |
| --- | --- |
| `id` | `<module>.<name>`, such as `box-office.checkout-questions` |
| `subject` | The record type the response is about, from the abilities registry's record types |
| `mode` | `submission`: answered once, at a moment the host chooses. `record`: custom fields, always editable with the record |
| `scope` | Whether a form is attached to one record (this ticket type), to all records of the type, or either |
| `respondent` | Who answers: the acting person, or staff only |
| `limit` | The most forms one record may carry in this slot |
| `attach` | The ability needed to attach or detach a form here |
| `features` | What a form here may not use: for instance no pages, no workflow, no payment at checkout |

The builder reads `features` and hides what the slot forbids, so a theatre cannot build a three-page form with a review stage and attach it to a checkout.

Slots this specification expects, each owned by its module's workstream:

| Slot | Mode | Asked when |
| --- | --- | --- |
| `forms.link` (forms' own) | submission | Someone opens the form's link or an embedded form on a content page |
| `core.season-call` | submission | A season's call for proposals is open |
| `core.production-fields`, `core.person-fields`, `core.venue-fields` | record | The record is created or edited |
| `core.production-signup` | submission | A production invites sign-ups, such as auditions |
| `box-office.checkout-questions` | submission | An order containing the ticket type is placed |
| `membership.application` | submission | Someone applies to join |
| `spaces.booking-extras` | submission | A booking of the space is requested |
| `front-of-house.incident-report` | submission | An incident is logged |
| `finance.expense-claim` | submission | A claim is made |

## Services forms offers

Exported from the module's services file. A module that calls them lists `forms` in `requires`.

| Service | Does | Writes |
| --- | --- | --- |
| `slotForms(slot, subject)` | Returns the forms attached there for the current person, with definition, resolved facts, prefill and any draft | Nothing |
| `checkAnswers(slot, subject, answers)` | Runs the engine on the server and returns visibility, errors and calculated values | Nothing |
| `addResponse(unit, input)` | Adds to the caller's unit of work every statement for a submitted response: the response, its answers, counts, stage history, audit entry and event. Returns the response id. Never commits | Through the unit |
| `addRecordFields(unit, subject, answers)` | The same for custom fields: a new revision of the record's response | Through the unit |
| `recordFields(subject)` | The current custom-field values of a record, already filtered to what the current person may read | Nothing |
| `fieldColumns(slot)` | The questions of the forms in a slot as column descriptions, so a host's list and export can include them | Nothing |
| `withdrawResponses(unit, subject, reason)` | Adds statements that withdraw the responses about a record, for example when an order is cancelled | Through the unit |
| `responseStatus(responseId)` | State, stage kind and the status wording the submitter sees | Nothing |

`addResponse` fails the whole unit, by database constraint, if the cap is reached, a limited option is full or the person already has a response where one each is allowed. The host learns which from one shared helper, as the paper requires for constraint violations.

Forms also publishes two interface components for hosts to place on their own pages: `FormsSlot`, the slot renderer, and `FormsRecordFields`, the record-fields panel. Foundations confirmed the rule on 16 November 2026: a module's public components live in its `app/components/public/` folder, carry the module's name as a prefix, and a change to their props is a breaking change to the module's interface.

## Events forms announces

Each is written in the same unit of work as the change. Payloads hold identifiers and public or internal values only, never an answer, a name or free text. Since outgoing webhooks joined the first release, foundations makes every announced event deliverable to a webhook unless it is declared internal. The form events (published, closed) are not internal. Every response, review and action event is declared internal, because the fact that someone answered a form can itself be sensitive; a form's settings may opt its response events in to webhooks, and the builder says what a webhook would then receive.

| Event | When | Payload |
| --- | --- | --- |
| `forms.form.published` | A version goes live | form id, version number, impact class |
| `forms.form.closed` | A form stops taking responses | form id |
| `forms.response.submitted` | A response is submitted or resubmitted | response id, form id, slot, subject, revision |
| `forms.response.moved` | A response changes stage | response id, from kind, to kind, transition key |
| `forms.response.decided` | A response reaches `approved` or `declined` | response id, form id, slot, subject, outcome |
| `forms.response.withdrawn` | The submitter or a host withdraws it | response id, subject |
| `forms.response.revised` | A record's custom fields change | response id, subject, revision |
| `forms.review.requested` | A reviewer is assigned | assignment id, response id |
| `forms.review.released` | A review round is opened to the panel | response id, round |
| `forms.action.failed` | An outcome action is abandoned after its retries | action run id, action key |

## Events forms listens for

Names outside `forms.` are placeholders until their owners publish them.

| Event | Owner | Forms does |
| --- | --- | --- |
| A charge succeeded or failed | Payments (workstream 4) | Moves a response from `awaiting_payment` to `submitted`, or leaves it and tells the person |
| Two people were merged | Identity (workstream 2) | Nothing to repoint, because the merge has already moved forms' account columns in its own batch. Where the merged person now has two responses to a one-each placement, forms keeps both and flags them |
| A record was deleted or archived | Its owner | Nothing by itself. The owner calls `withdrawResponses` if it wants responses withdrawn |

Erasure is not an event for forms. The data-class registry handles the columns, using the per-row class on `forms_answers`, and forms contributes a handler for what the registry cannot express.

## What forms contributes to core points

| Point | Contribution |
| --- | --- |
| `core.navigation` | "Forms" in the console, shown to holders of any forms ability. "Reviews" in both the members' area and the console, shown to anyone with a review waiting. "My forms" in the members' area, shown when the person has a draft or a response |
| `core.account-section` | "My forms" under the audience account, so an audience member finds their responses without entering the members' area. Each response opens in the shell it was answered in |
| `core.home-card` | Drafts to finish, and responses awaiting this person's review |
| `core.record-tab` | The record-fields panel on a core record, and the forms attached to it. This is how custom fields reach core records without core importing forms |
| `core.file-access` | Who may open a file uploaded as an answer: whoever may read that answer |
| `core.setup-step` | Choose starting templates; set the default retention period |
| `core.erasure-handler` | Delete draft blobs and uploaded files of the erased person; redact free-text answers and messages; remove invitations and participation rows |
| `core.privacy-record` | One entry per question that is not Internal or Public: the form, the question, its class, its retention and whether it is bound to an attribute |
| `core.record-resolver` | Titles and links for a form and a response |
| `core.health-check` | Outcome actions stuck or abandoned; forms live past their closing date with responses undecided |
| core.notification-type | Receipt, returned for changes, decision, review requested, reminder of an unfinished draft, closing soon. The shipped wording lives in forms' code and a theatre's rewording is a core template row, so forms has no template table for messages. Forms sends with core's notify service inside its own unit of work |

## What forms calls in core

Two core services from the core domain draft ([Workstream 3](https://claude.ai/artifact/Qt8cFSyEekr7tfpiMCqe2E), by message on 16 November 2026).

- **Vocabularies.** Core owns reusable option lists. A choice question may take its options from one through `listTerms`, the server checks a submitted option with `assertTerm`, and the answer stores the term's id with a snapshot of its label, never the label alone. A retired term stays readable on old answers and is not offered on new ones. The builder can create a theatre's own vocabulary, with a key beginning `x.`, for a holder of `core.vocabulary.manage`. Forms needs neither a hierarchy of terms nor a value per term; a cap on an option is forms' own, in `forms_option_counts`.
- **Files.** An uploaded answer is a row in `core_files` in a file slot that forms declares on its response record type. Forms stores no file bytes of its own. The file slot is contributed to core.file-slot, and a vocabulary forms ships is contributed to core.vocabulary. Slot subjects use the record types their owners publish: core.production, core.performance, core.season, core.venue and core.space from workstream 3, and core.account for a person from workstream 2.

## Facts and record types forms declares

| Declaration | Meaning | Used for |
| --- | --- | --- |
| Record type `forms.form` | A form. Its parent is the record it is attached to, if any | Abilities granted on one form: edit, read responses, review, decide. A grant on a form covers its responses |
| Record type `forms.response` | A response. Its parent is the form and its owner is the submitting account | Ownership lets the submitter read, revise when returned and withdraw. Nothing is granted on a single response |
| Fact `forms.submitter` | The person submitted this response | The same ownership for a response keyed to an email address, matched through the account's verified addresses |
| Fact `forms.co-author` | The submitter added this person to the draft | Editing one draft, for a proposal written by a team |
| Fact `forms.reviewer` | The person has a live assignment on this response | Read the answers and submit a review |

A conflict of interest is not a fact. Workstream 2 ruled on 16 November 2026 that roles, facts and ownership only ever allow, so nothing in the permission model can take access away. The lockout is a guard in forms' own service: after the platform's authorisation passes, forms refuses when the person is on the response's conflict list, with a refusal code the interface explains. The guard applies to every role including the Owner, and to lists, search, counts and exports as well as the response page.

Facts forms reads from others, for conditions on "who is answering": signed in, is a current member, membership type, belongs to a group, age band where the theatre holds a date of birth. Each is declared by its owner in the `facts` section; forms lists whatever is declared and invents none.

## Jobs and scheduled tasks

| Name | Kind | Does |
| --- | --- | --- |
| `forms.run-action` | Job | Applies bindings or runs one outcome action for one stage change, with its idempotency key |
| `forms.build-export` | Job | Builds a results export in pages and stores it through Files |
| `forms.sweep-retention` | Task, daily | Anonymises responses past `retention_due_at` |
| `forms.sweep-drafts` | Task, daily | Deletes drafts untouched for longer than the setting allows, after a reminder |
| `forms.send-reminders` | Task, daily | Unfinished-draft and closing-soon reminders; reviews outstanding |

## Points settled and still open with other workstreams

| Point | With | State | Outcome or proposal |
| --- | --- | --- | --- |
| Forms is always on | 1 | Settled | `switchable: false`. Forms is its own layer, core never imports it, and any module may list it in `requires` without tying its own switch to it |
| Sharing an interface component | 1 | Settled | Public components in `app/components/public/`, prefixed with the module's name; props are part of the interface |
| Append-only tables and erasure | 1 | Settled | The trigger allows an update only when every changed column is declared erasable and the new value is its erased value. A delete is always refused. For a per-row class the erased value follows the row's own class |
| A data class per row | 1 | Settled | The registry accepts a column whose class is named by a sibling column, which `forms_answers` uses |
| A fact that denies | 2 | Settled: no | Facts only allow. The conflict lockout is a guard in forms' own service, applied to every role and to lists, search and exports |
| Abilities scoped to one form or one response | 2 | Settled | Grants stop at the form and cover its responses. One response is reached by ownership or by a fact forms declares |
| Guests and people without accounts as respondents | 2 | Settled | A response made while signed out is keyed to the email address given, using foundations' email subject, never to an account. It is not re-keyed when the person later claims an account: "My forms" finds it by the account's verified addresses. A response made while signed in is keyed to the account. No row carries both |
| Custom fields on a person | 2 | Settled | They attach to `core.account` with a side, audience or members, and appear through `core.account-section` |
| Membership as a fact | 2 | Settled | `core.member` is the single "is a member now" fact for conditions on who is answering |
| Person merge and claim events | 2 | Settled | `core.account.merged` and `core.account.claimed` |
| Vocabularies | 3 | Settled | Core owns them; forms stores the term id and a label snapshot |
| Files | 3 | Settled | Uploads live in `core_files`; forms contributes to `core.file-access` |
| Notifications and record type names | 3 | Settled | Types are contributed to `core.notification-type`; slot subjects use core's published record types |
| The builder, filler and review screens | 6 | Settled | A named Editor layout exists for the builder. Two short related questions may sit side by side at laptop width. Review and My forms are placed as tab 5 says |
| Charges from a form | 4 | Open | Proposed: forms requests a charge with an expected total and a reference to the response; Payments owns the attempt and the ledger entry. Not needed for the first release |

## Rulings given to other workstreams

- **A contributed field type may store more than one value in its answer** (asked by communications, 16 November 2026). The contributing module declares the shape of its answer value, and forms validates and stores it whole in the one answer row, under that row's data class. A consent field can therefore keep the id of the wording the person saw beside their yes or no. An outcome action receives the answers it is mapped to as stored, so the wording id reaches it with no special case. Forms does not read inside the value; results and exports show the label the contributor's display function returns.

* **Membership's four declarations fit as specified** (asked by membership, 16 November 2026). `membership.application` is a slot in submission mode with a membership scheme as its subject (FB-501, FB-502). `membership.member-fields` is a slot in record mode (FB-503's mechanism, on membership's own record). `membership.start-membership` is an outcome action, run exactly once on the approving transition (FB-506's mechanism, with FB-403 and FB-407). `membership.simple-application` is a module-contributed template (the second half of FB-510). All four rest on stories in the later list, so they arrive when membership is scheduled, not with the forms first release.
