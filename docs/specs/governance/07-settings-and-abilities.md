# 6. Settings and abilities

Governance declares ten settings in five groups and fourteen abilities. It adds no preset role (ruling R-03): its abilities are suggested for Identity's existing keys and for its own facts, which is how a post brings authority.

## Settings

Placement follows Foundations' settings format: one group per first segment (handover, committee, documents, feedback, terms), each a section of the module's generated page, reached through the cog modal on any Governance screen and under Admin > Modules. None is advanced. All are changed by holders of `governance.settings.manage` and have audience staff, so those columns are left out. Durations use the kit's DurationInput and are stored as whole seconds.

| Key | Kind | Default | Limits | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- |
| `governance.handover.opens-before` | duration | 6 weeks | 1 week to 6 months | No | How long before a term's last day its handover pack opens |
| `governance.handover.grace` | duration | 1 month | 0 to 3 months | No | How long after a term the outgoing holder keeps the pack, and how long after a year end before the public page may say it is out of date |
| `governance.committee.listing-default` | choice | ask | ask, shown, hidden | No | What a new term's public listing starts as. `ask` shows the post's name until the holder agrees. Question 2 |
| `governance.committee.out-of-date-notice` | boolean | true |  | No | Whether the public page says it may be out of date |
| `governance.terms.check-requirements` | boolean | true |  | No | Whether the daily check flags holders who no longer meet a post's requirements |
| `governance.documents.default-review` | duration | 1 year | 1 month to 5 years | Yes | Review period for policies and any kind that names this setting |
| `governance.documents.due-warning` | duration | 30 days | 1 day to 6 months | No | How long before a review date a document shows as review due and its owner is told |
| `governance.feedback.shells` | choice, several | console, live | console, live, members | No | Where the feedback button shows |
| `governance.feedback.per-day` | number | 10 | 1 to 100 | No | Reports one person may send a day |
| `governance.feedback.keep-for` | duration | 2 years | 1 month to 7 years | No | How long reports are kept. onChange confirm: shortening it deletes rows at the next sweep |

Added on 24 November 2026 after Matt's answers to questions 5b and 6. Each lives on its subject page: the meeting settings on the Meetings page's cog, the upstream setting on the Feedback page's cog.

| Key | Type | Default | Where | What it does |
| --- | --- | --- | --- | --- |
| `governance.meetings.agenda-notice` | duration (number and unit) | 7 days | Meetings | How long before a meeting the agenda should go out; later sending asks for a reason (M2) |
| `governance.meetings.minutes-due` | duration | 14 days | Meetings | After this, a held meeting without written minutes shows on health |
| `governance.actions.reminder` | duration | 3 days | Meetings | When an action's owner is reminded before its due date |
| `governance.feedback.upstream` | checkbox | off | Feedback | Also send bug reports, without personal data, to the Proscenium project; the reporter decides separately whether their words go too (GV-30) |

A body's quorum is a field on the body, not a setting, since bodies differ.

Every number above is a proposed default, to be confirmed at the workshops in the order of work, as other modules' are.

## Abilities

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `governance.body.manage` | site | normal | ignored |  | Add, edit and archive bodies | `administrator` |
| `governance.post.manage` | `governance.body` | normal | ignored | term.view | Add and edit posts: seats, term rule, requirements, role address, checklist | `administrator` |
| `governance.term.view` | `governance.body` | normal | ignored |  | See every term, including names not listed publicly, and history | Fact `governance.member-of`; `committee-member`; `administrator` |
| `governance.term.manage` | `governance.post` | privileged | refuses | term.view | Record and end terms; record a holder's listing consent. Privileged because office confers authority | `administrator`; `membership-officer` |
| `governance.handover.write` | `governance.post` | normal | ignored |  | Write notes, tick items, mark ready, mark received | Facts `governance.post-holder`, `governance.handing-over` |
| `governance.handover.manage` | site | normal | ignored | handover.write | See every pack; mark a pack ready; edit a post's checklist | `administrator`; `membership-officer` |
| `governance.handover.redact` | site | privileged, fresh | ignored |  | Find and redact a person named in handover notes, for a data request | `administrator` |
| `governance.document.view` | `governance.document` | normal | grants |  | Read documents whose visibility is staff | Fact `governance.member-of`; `committee-member`; `administrator` |
| `governance.document.manage` | site | normal | ignored | document.view | Create, edit, re-own and retire any document; upload versions | `administrator`; `membership-officer` |
| `governance.document.sign-off` | `governance.document` | normal | ignored | document.view | Approve or review unchanged a version of Governance's own kinds | Fact `governance.member-of` (pin to the theatre's main body at setup) |
| `governance.document.publish` | `governance.document` | privileged | ignored | document.view | Make a document public, or stop it being public | `administrator` |
| `governance.feedback.send` | site | normal | grants |  | Send feedback; see one's own reports | Every preset role except `visiting-company`; facts `governance.member-of`, `front-of-house.on-shift` |
| `governance.feedback.triage` | site | privileged | ignored |  | Read and triage every report. `audit: 'read'`, `fresh: false` | `administrator` |
| `governance.settings.manage` | site | privileged | ignored |  | Change the settings above | `administrator` |

Added for meetings and actions:

| Ability | On | Risk | Owner rule | Implies | Audit | Default mapping |
| --- | --- | --- | --- | --- | --- | --- |
| `governance.meeting.view` | `governance.body` | normal | none | none | no | the `governance.member-of` fact for that body |
| `governance.meeting.manage` | `governance.body` | normal | none | `governance.meeting.view` | yes | none beyond Owners; NNT maps it to the Secretary post at setup (question 8) |
| `governance.action.update` | `governance.action` | normal | owner grants (the action's owner may close their own) | none | yes | managers of the body |

Approving minutes uses `governance.document.sign-off` on the `governance.minutes` kind, which declares `separateSigner` false (the person who drafted the minutes may sign them off, as committees approve their own). The upstream setting needs `governance.settings.manage`, already in the table above.

Notes:

- **Refuses on terms.** `owner: 'refuses'` on `governance.term.manage` is what stops anyone recording, ending or extending their own term (rule T3). Recording a new term asks the kit's `ownRecordExempt(actor)` because the record does not exist yet. An Owner is exempt (Matt, 23 November 2026). Resignation (T6) is the service's own exception and needs no ability.
- **What office opens is the theatre's choice.** A fresh install maps nothing beyond the defaults above to the post facts. The setup step suggests, for each preset post it creates, the abilities Identity's matching preset role suggests (Treasurer: `finance-officer`'s), shown for the person to confirm. A privileged ability mapped to a fact needs the confirmation Foundations requires.
- **Kinds bring their own abilities.** A module's document kind names its own sign-off and create abilities, granted however that module suggests. Governance's abilities above cover only its own kinds and the register as a whole.
- **The committee preset role still exists.** `committee-member` stays useful for oversight by people who are not post holders, or where Governance is off. With Governance on, a theatre can map the same abilities to `governance.member-of` and stop granting the role yearly.
