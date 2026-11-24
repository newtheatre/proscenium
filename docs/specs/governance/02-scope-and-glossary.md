# 1. Scope and glossary

Governance owns the theatre's governing bodies, their posts and terms of office, handover between holders, the register of documents with owners and review dates, and feedback from inside the app. It owns no money, no permissions and no public policy text.

## In scope

| Area | What is in |
| --- | --- |
| Bodies and posts | Any number of bodies (Committee, Board of trustees, Youth committee). Posts within a body, each with seats, a term rule, whether it is elected, a role address shown publicly, requirements a holder must meet when taking office, and whether it is listed publicly |
| Terms of office | Who holds a post from a date to a date, in what capacity (elected, appointed, co-opted, acting), and where the term came from (an election result, a meeting, staff entry). Ending a term early with a reason. Vacancies |
| Meetings and actions | Meetings of a body from draft to approved minutes: agenda with reserved items, notice, apologies, attendance, quorum, minutes as a register document, and action items with owners, due dates and reminders. In the first release by Matt's answer to question 6. Bug reports may also go to the upstream project when a theatre opts in (question 5b). |
| Authority from office | Two facts: membership of a body, and holding a particular post. A theatre maps abilities to them on Identity's roles screen |
| Public committee page | A content component and inline tokens that list current holders, with the holder's agreement to show their name, and a notice when the list may be out of date |
| Handover | A pack per post per committee year: the outgoing holder's notes, a checklist carried forward, documents the post owns, and sections other modules contribute. Read access for the outgoing holder through a grace period |
| Document register | Documents of declared kinds, attached to a record or standing alone, with versions, an owner, a review cycle, sign-off, lapse, retirement and visibility (staff, members, public) |
| Feedback | A bug or idea sent from a console or live screen with its context; a triage queue; an event for forwarding |

## Out of scope

| Thing | Where it lives |
| --- | --- |
| Elections, nominations, ballots, counting, results | Elections (spec 7). It starts terms through `elections.subject` |
| Roles, grants, the permission screens | Identity. Governance declares facts; Identity resolves them |
| Honours such as fellowships and life membership | Membership and Awards |
| Public policy text (privacy, terms, tickets) | Core's policies, Markdown in the repo. A register document may link to one |
| Risk assessment content, licences, show reports | Productions declares the kinds and owns its task flow; the files live in the register |
| Inspections such as PAT tests and their due dates | Inventory. Only a certificate with a review cycle belongs in the register |
| Budgets, accounts, annual returns | Budgets and claims; Invoices and exports; Reports |
| A tracker for software defects | Outside the app. Feedback is forwarded by event (webhook), never by a tracker token in the Worker |

## What Governance assumes of other modules

| Module | Assumption | State on 23 November 2026 |
| --- | --- | --- |
| Core (identity) | Facts may be declared `pin: true` and mapped to abilities for one record (`core_fact_abilities.pinned_record`), as Identity's data model specifies | Column built; the resolver reads only unpinned mappings (`layers/core/server/identity/grants.ts`). Pinned resolution is a dependency of GV-04 |
| Core (identity) | `core.organisation.year-end` gives the committee year | Built (`layers/core/server/identity/year-end.ts`) |
| Core | `core_files` with owner type, slot and access, for document versions and photos | Built |
| Core | Points `core.record-tab`, `core.record-check`, `core.home-card`, `core.health-check`, `core.account-section`, `core.navigation`, `core.requirement`, `core.record-resolver`, `core.privacy-record`, `core.setup-step` | Built (`layers/core/module/points.ts`) |
| Core | `core.measure` and service `measures.read` | Declared by the Reports spec this round |
| Core | Webhooks deliver events marked external | Built (`core_webhooks`) |
| Interface | A place in the console and live shells for the feedback button | To agree with Interface; until then a `core.quick-action` entry |
| Elections | Point `elections.subject` | This round, agreed |
| Communications | Point `communications.audience-source` | Specified |
| Public site | Content components and inline tokens from a module's layer | Built for policies (`:setting`, `:fact`); committee tokens follow the same pattern |

## Glossary

Words Governance owns. Other specs cite these rather than define their own.

| Word | Meaning |
| --- | --- |
| Body | A group that governs: a committee, a board of trustees. Has posts |
| Post | An office within a body, such as Treasurer. Has one or more seats |
| Seat | One place in a post. A post with three seats has up to three holders at once |
| Term of office (term) | One person holding one post from a start date to an end date |
| Holder | The person a current term names |
| Capacity | How a holder came to the post: elected, appointed, co-opted or acting |
| Acting holder | Someone holding a post to cover a vacancy until it is filled. Takes a seat |
| Vacancy | A seat with no current term |
| Committee year | The year between two of `core.organisation.year-end`; begins the day after it |
| In office | Holding a current term. The fact `governance.member-of` for the body, and `governance.post-holder` for the post |
| Handover pack | What the outgoing holder of a post leaves the incoming one for a committee year |
| Handover section | One part of a pack that a module contributes, such as last year's numbers |
| Grace period | The time after a term ends during which the outgoing holder can still read and finish the pack |
| Document | An entry in the register: a title, a kind, an owner, a review cycle, versions |
| Document kind | A declared type of document, such as policy, minutes or risk assessment. Kinds are contributed by modules |
| Version | One uploaded file of a document. Versions are never changed |
| Sign-off | A record that a person with the right ability approved a version, or reviewed it and found no change needed |
| Current version | The latest signed-off version (or, for a kind with no sign-off, the latest version) |
| Review date | When the current version must next be reviewed |
| Lapsed | A document whose review date has passed without a new sign-off |
| Retired | A document no longer in force, kept for the record |
| Feedback report | A bug or idea sent from inside the app |
| Triage | Deciding what happens to a feedback report |
