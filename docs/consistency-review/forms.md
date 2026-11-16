# Form builder (module `forms`, table prefix `forms_`) consistency findings

Area: `docs/specs/form-builder/` (all 11 files and both wireframe SVGs), checked against foundations (`02-formats.md` and its rulings, `02-2`, `02-3`, `02-4`, `06`), identity, core domain, box office and payments, the interface specification, and the design paper (`04-3-form-builder.md`, `04-2`, `07-roadmap.md`, `08-decisions.md`, `11-...status`, `12-...backlog`).

All line numbers are real file line numbers (`grep -n`). Paths are relative to `/home/user/proscenium/docs/` unless short names are given: "forms 03" means `specs/form-builder/03-data-model.md`, and so on.

## Summary

- 8 HIGH, 11 MEDIUM, 7 LOW. 26 findings in all.
- Internal counts all check out: 16 tables plus 1 later, 21 screens, 20 settings, 14 abilities, 41 stories (27 + 14), 27 named tests, 10 questions, 10 decisions, 10 templates.
- The three most important:
  1. **Checkout questions are two incompatible designs** (finding 1). Forms says box office contributes a *slot* `box-office.checkout-questions` about a *ticket type*, using `addResponse`. Box office says it *offers* a data *point* `box-office.checkout-question` (singular) about a *production*, and its approved pattern is a code-point `record()`. Box office has no ticket-type record type, so the slot's subject does not exist.
  2. **"Group" is a concept forms depends on that nobody defines** (finding 2). Placements (`audience_group_id`), reviewers, transition rules and `forms.review.score` all use "a group". Identity has roles and facts only. The column references nothing.
  3. **The response lifecycle contradicts itself on what a simple form ends in** (finding 4). The diagram says a form with no review step "stops at Pending" (a non-final kind), but the default workflow is kind `closed`. Retention starts only at a final stage, so the wrong reading means retention never starts.

## Findings

### HIGH

**1. HIGH. Checkout questions: name, kind, direction and subject all differ between forms and box office.**
- Side A (forms 05:48): `| box-office.checkout-questions | submission | An order containing the ticket type is placed |`. Forms 05:11 gives the mechanism: Box office is the example contributor to `forms.slot`. Forms 06:102 also has the template "Questions at checkout | `box-office.checkout-questions`", and 08:217 has "`box-office.checkout-questions` is added to the box office after both exist".
- Side B (box-office 05:83): `| box-office.checkout-question | data | A form (from the form builder) asked at checkout for a production, such as dietary needs for a dinner show. Later release |` in the table "Offered by Box office". Box office 05:236 says the approved pattern is "a **code point**. A contribution supplies its questions ... and a function `record({ orderId, accountId, keys })`", "the pattern Foundations approved for forms".
- Differences:
  - name: singular against plural;
  - mechanism: Box office offers a point that a form fills, against Box office contributing to `forms.slot`;
  - subject: a production, against a ticket type (the paper's 04-3:14 also says ticket type);
  - rule: forms has the host call `addResponse(unit, input)`, a forms service. Foundations' later ruling (02-formats 146) says a module that only `uses` another may not call its services.
- Also: the box-office record-type table (box-office 07:77-83) has no ticket-type record type (only order, ticket, comp-request, pass, session, refund, period). A slot `subject` is "from the abilities registry's record types" (forms 05:30), so the subject cannot be declared.
- Forms 01:76 and 10:39 list "the checkout slot's name and restrictions" as open. Box office 02-scope:49 and 05:201 only say "A form attachable to a checkout, later release" and never mention the question.
- Prevail: unclear, needs Matt/integration. Suggest the forms slot model wins (it is the generic one and keeps the dependency pointing from host to forms). Box office should drop its own point, declare a record type `box-office.ticket-type` (or settle on production), and call `addResponse` as a `requires forms` host. Or the opposite: forms adopts box office's `record()` code-point pattern. Either way both documents must name the same thing.
- Owner: box office 05 and 07 (record types); forms 05 and 06.

**2. HIGH. "Group" as an audience, a reviewer set and a transition actor is not defined anywhere.**
- Side A: forms 03:117-118 `audience` check includes `group`, `audience_group_id | text, null; required when audience is group` (no table referenced). Forms 04:125 "who may rule: an ability, a group, the assigned reviewers ...". Forms 04:133 "Reviewers are a group, named people, or both". Forms 07:61 `forms.review.score` "Granted per form or by group". Forms 05:137 fact "belongs to a group". Forms 08:160 FB-405 "workstream 2 for groups". Forms 08:106 FB-301 "workstream 2 for audiences".
- Side B: identity has no group concept. Roles, grants and facts are what exist (identity 07:138-160 preset roles; identity 05:100 communications sources are role-holders, ability-holders and members). `grep -i group` over identity finds only an unrelated order case (05:53).
- The foundations index (06:51) also lists no group point or record type.
- Prevail: identity owns who people are grouped as. Suggest forms replaces "group" with "holders of a role" (`holdersOfRole`, identity 05:100) or a role/fact reference stored as the `core.requirement` style reference `<source>:<id>` (foundations 02-formats), and drops `audience_group_id` or retypes it. Otherwise identity must define a group.
- Owner: forms 03, 04, 07, 08; identity (if a group is wanted).

**3. HIGH. Foundations' per-form webhook opt-in is not something the manifest can express.**
- Side A (forms 05:75): "Every response, review and action event is declared internal ... a form's settings may opt its response events in to webhooks, and the builder says what a webhook would then receive." Forms 09:57 repeats it: "No response, review or action event reaches a webhook unless the form opts its response events in".
- Side B (foundations 02-formats 154): "A module keeps one off webhooks by declaring it `internal: true` in `events.announces`. An internal event ... is never offered in the webhook screen and never delivered outside." The declaration is static per event, not per form.
- Prevail: foundations. Either forms declares a second, non-internal event for opted-in forms (for example a separate `forms.response.shared` event with ids only) and the opt-in is a form setting that decides whether it is announced, or foundations rules on a conditional flag. As written, a form cannot opt in and the test "Quiet by default" cannot pass in its opt-in half.
- Owner: forms 05 and 09; foundations (if it wants to allow conditional internal).

**4. HIGH. What a simple form's response ends in: "stops at Pending" against "default stage is `closed`".**
- Side A (forms 04:81, in the response diagram): "A form with no review step stops at Pending. Approval may run an outcome action."
- Side B (forms 04:127): "The default workflow is one stage, Received, of kind `closed`." Forms 04:118: record mode has "stage kind `closed` throughout". Forms 04:102 says `closed` is "the default for a simple form". Forms 04:99 lists `pending` as non-final.
- Why it matters: forms 03:163 `retention_due_at` is "set when the response reaches a final stage"; forms 04:46 archive needs "no response short of a final stage"; forms 04:115 withdraw ends at a final stage. A form that "stops at Pending" never starts retention or archiving.
- Also the diagram has no path from Draft to Pending without payment (only "submit -> Awaiting payment (only if the form charges)"), and a stage with kind `approved` is shown only after review although the note says approval needs no review.
- Prevail: the table and rule text (04:102, 04:127). Fix the diagram note to "A form with no workflow stops at Received (closed)" and add a direct submit -> stage edge.
- Owner: forms 04.

**5. HIGH. Review summary: who sees the scores after release.**
- Side A (forms 04:134, 04:139): "Release is a transition a chair performs; from then the panel sees all scores." and "A summary ... appears to the panel only after release." Forms 08:165 FB-405.3: "After release, the panel sees the summary with mean, spread and weighted total."
- Side B (forms 06:23): screen 13 "Review summary ... `forms.review.chair` or `forms.response.decide`". Forms 06:133: "The summary appears to the chair after release". Forms 07:61-62: `forms.review.score` is "Be assigned as a reviewer and submit reviews"; `forms.review.chair` is "see the summary". Nothing lets a panel reviewer (score only) see the summary.
- Prevail: unclear, needs Matt. The tab 3 rule and the FB-405 criterion say the whole panel; the screen and ability tables say chair/decider. Either `forms.review.score` gains "see the summary after release" and screen 13 admits reviewers, or tab 3 and FB-405 say "chair".
- Owner: forms 04, 06, 07, 08.

**6. HIGH. The first release has no way to place the templates it ships.**
- Side A (forms 06:95-108): "Templates shipped with the first release": ten templates, each tied to a slot (`core.season-call`, `membership.application`, `core.production-signup`, `box-office.checkout-questions`, `spaces.booking-extras`, `front-of-house.incident-report`, `finance.expense-claim`, `core.production-fields`); several need bindings, limited options, record mode or outcome actions. Forms 08:100 FB-208: "Each shipped template passes the problems list with no error." Forms 09:86: "The ten shipped templates are test fixtures: each must pass the publish checks and be fillable end to end".
- Side B (forms 08:198-210): slots (FB-501), the slot renderer and `addResponse` (FB-502), custom fields (FB-503), pickers (FB-504), bindings (FB-505), outcome actions (FB-506), limited options (FB-507), templates from modules (FB-510) are all in "Later". Only `forms.link` (FB-301) is first release. Design paper backlog (12:13, 12:63): 27 first-release stories, the rest "unscheduled". Roadmap 07:20: forms in phase 4 "arrives before the modules that lean on it (membership applications, booking extras, incident reports)".
- The roadmap promise cannot be kept by the first release (no slots) and the shipped-template list is mostly unplaceable. Four of the shipped templates also cite `core.season-call`, which no spec declares (finding 8).
- Prevail: the stories list (it is the build order). Suggest the template table is split into "first release (on `forms.link`)" (Access requirements, Feedback survey) and "arrive with their slot", and the roadmap line is corrected, or FB-501/FB-502/FB-503 move to the first release. Also, FB-206 and FB-208 should say which templates are fixtures in the first release.
- Owner: forms 06 and 08, 09; paper 07-roadmap.

**7. HIGH. Foundations index of facts and record types for forms is stale.**
- Side A (foundations 06:51): `| Forms (5) | forms.slot, forms.field-type, forms.bindable, forms.outcome-action, forms.template | as declared in its document | none |` (Facts: none).
- Side B (forms 05:127-133): forms declares record types `forms.form`, `forms.response` and facts `forms.submitter`, `forms.co-author`, `forms.reviewer`. Foundations 06:72 itself mentions "the fact forms.co-author".
- Foundations 06:40-42 says the index exists "so two workstreams cannot claim the same name"; the three facts are unindexed.
- Prevail: forms (owning workstream's document is the authority, per foundations 06:44). Update the index row to list the three facts.
- Owner: foundations 06.

**8. HIGH. The slots forms "expects" are not declared by the workstreams said to own them.**
- Side A (forms 05:40): "Slots this specification expects, each owned by its module's workstream", listing `core.season-call`, `core.production-fields`, `core.person-fields`, `core.venue-fields`, `core.production-signup` (core), `membership.application`, `spaces.booking-extras`, `front-of-house.incident-report`, `finance.expense-claim`. Forms 01:75 claims alignment with core domain on "the record types that slots refer to".
- Side B: core domain declares none of them (`grep -i 'season-call\|production-signup\|-fields' specs/core-domain-and-public-site/*.md` finds nothing; core 02-scope:26 and 02-scope:50 A10 only say custom fields attach to `core.production` and `core.venue` "by its registered name"). Identity (02-scope:53, 05:224) says forms "attach fields to `core.account` with a side" and calls the contribution "account sections"; it names no slot. Foundations 06:51 index has no slot names.
- Related: forms 05:160 says custom fields on a person "attach to `core.account` with a side, audience or members". The slot format (forms 05:27-36) has no `side` field, and `core.person-fields` is named "person", not account.
- Prevail: forms 05:40 states it is "expected"; the claim "each owned by its module's workstream" is therefore a request. Core domain and identity should acknowledge `core.*-fields` (or forms should own them as `forms.production-fields`), and the slot format needs a `side`.
- Owner: forms 05 (rename or add `side`); core 05 and identity 05 (declare or accept).

### MEDIUM

**9. MEDIUM. Payments: forms still waits on an interface Payments has already designed differently.**
- Side A (forms 05:96): "A charge succeeded or failed | Payments (workstream 4) | Moves a response from `awaiting_payment` to `submitted`". Forms 05:167: "Charges from a form | 4 | Open | Proposed: forms requests a charge with an expected total and a reference to the response". Forms 04:110: "Payments announces a successful charge for this response's attempt".
- Side B (box-office 05:311): "Any module can own a payment. An intent part's owner is a module and a record ... Online, the owner calls Payments' `collect` with its parts". Box office 05:59: `payments.settlement` code point with `settle(uow, intent)`. Box office 05:126/145: `payments.intent.succeeded/.unfulfilled/.expired` are "plumbing between Payments and the owning module", not the outward fact.
- So forms would be an owner contributing a `payments.settlement` handler (and `payments.desk-basket` if staff took payment), not a listener for a charge event. The name "attempt" in forms 04:110 is also the wrong object (payments has intents with parts and attempts under them).
- Prevail: box office/payments (it is the owning module and has since answered). Suggest forms rewrites the row and the "Open" line to "forms contributes a settlement handler for owner `forms.response`", and stays out of the first release as already decided.
- Owner: forms 04, 05, 10 ("three points still open" count); box office 05 should acknowledge forms as an owner.

**10. MEDIUM. Facts forms reads for "who is answering" are not declared by their owners.**
- Side A (forms 05:137): "Facts forms reads from others ...: signed in, is a current member, membership type, belongs to a group, age band where the theatre holds a date of birth. Each is declared by its owner in the `facts` section".
- Side B (identity 05:176 and 05:178-182): "Identity declares one fact, core.member". "A fact for 'has a live session'" is now the route declaration `signed-in`, not a fact. No age band or date of birth exists in identity (the access-profile table is welfare data). Membership's facts are `membership.holder` (standing), `membership.supporter`, `membership.scheme-holder`, `membership.voter` (foundations 06:90); there is no "membership type" fact. Foundations 02-formats (requirements ruling) offers `core.requirement` with `fact:<name>` references and membership as a source.
- Also forms 05:161 says "`core.member` is the single 'is a member now' fact", consistent with identity; but "signed in", "age band" and "group" have no declarer.
- Prevail: identity and foundations. Suggest forms 05:137 lists only `core.member`, `membership.*` facts and anything declared by `core.requirement` sources, and drops "signed in" (a respondent-kind switch handled by audience) and "age band" until someone declares one.
- Owner: forms 05; identity if age band is wanted.

**11. MEDIUM. Merge handling: forms says merge "moves" every person column, but append-only tables must use `alias`.**
- Side A (forms 03:170): "Every `person_id` column references `core.account`, and an account merge moves these columns in its own batch, so forms repoints nothing." Forms 05:97 repeats "the merge has already moved forms' account columns".
- Side B (foundations 02-4 line 94): "A check requires `alias` in an append-only table, because a merge cannot rewrite it." Identity 03:351 says the same. Forms' append-only tables with an account column are `forms_stage_history` (`actor_id`) and `forms_messages` (`author_id`); `forms_answers` and `forms_reviews` are also append-only.
- Forms also never declares `role` (subject or actor) or `onMerge` for any account column, which is the form the registry takes (02-4 lines 88-94). `forms_responses.person_id` is a subject; `created_by`, `published_by`, `entered_by`, `actor_id`, `author_id`, `reviewer_id` are actors.
- Prevail: foundations and identity. Forms should state `alias` for append-only actor columns and `move` for the rest; reads then follow `merged_into_id`. It should also say how `unique (placement_id, person_id)` participation and `unique (response_id, round, reviewer_id)` assignments behave when a merge joins two people (the "keeps both and flags them" at 05:97 covers only responses).
- Owner: forms 03 and 05.

**12. MEDIUM. Table options required by the registry are not declared: realm, subject, retention, append-only, erase behaviour.**
- Side A (forms 03:49-51): the tables list "Class" and "On erasure" per column only. `grep -i realm` over `form-builder/` finds nothing.
- Side B (foundations 02-4 line 66): `realm` is a required table option (`audience`, `member` or `operational`); "subject: Yes" (how a row reaches the person, a column, `{ via }`, or none); `appendOnly`, `retention`, `onErasure` are options. The later ruling lets realm differ by row (02-formats). Forms' "subject" (record the response is about, `subject_type`/`subject_id`) is also a different thing from the registry's subject (the person), which is confusing in the same document.
- A form answered by an audience member and one answered by a member sit in different realms; a response table with both needs `realm: { column: ... }`.
- Prevail: foundations format. Add a line per table (realm, subject, retention setting, append-only) and rename forms' columns or note the collision.
- Owner: forms 03.

**13. MEDIUM. Foundations' later email-subject rulings change what forms relied on.**
- Side A (forms 03:153): "A check constraint allows person_id or respondent_email, never both." Forms 05:159: "No row carries both."
- Side B (foundations 02-formats 209): "A subject may name an account and an email; the rule 'never both' is withdrawn ... The account wins ... A row with no account is found by its email, when that address is a verified address of the person asking."
- Also (02-formats 163): "A person with no account and no email. ... A table whose account subject column may be empty declares what happens to the rows it cannot link: `subject: { account: ..., unlinked: 'staff' }`." A response to an anonymous form has neither; forms 03:206 says "erasure cannot find it. That is the point". Under the ruling the schema check refuses a nullable account subject without `unlinked`, and the erasure screen lists such tables as a manual step for staff. Forms never declares `unlinked`, and its answers are Personal-class per row.
- Prevail: foundations (later ruling). Forms may keep its constraint as its own rule (it is stricter and allowed), but should say it is a forms rule, and must declare `unlinked: 'staff'` on `forms_responses` (or argue why an anonymous response, which holds only classed answers, is "subject none").
- Owner: forms 03 and 05.

**14. MEDIUM. Prefixes are registered for tables that have no id column, and the drafts' resume token is on the wrong table.**
- Side A (forms 03:344-363, foundations 06:94): prefixes `fans` (`forms_answers`), `fopt` (`forms_option_counts`), `fpar` (`forms_participation`) and `fdr` (`forms_response_drafts`, "Random: Yes, to hide when it was made. The resume link is a separate token column, stored hashed").
- Side B: those four tables are keyed by their own columns: forms 03:204 `forms_answers` composite key; forms 03:214 `placement_id, field_id, option_id`; forms 03:280 `placement_id, person_id`; forms 03:180 `response_id` primary key. Foundations 06:58: "A table keyed by its own columns (a join table, or one keyed by a name) has no id and needs no prefix." The token for resuming is `forms_responses.resume_token_hash` (03:161), not a column on `forms_response_drafts`.
- Prevail: foundations' rule. Either give those tables an id column or drop the four prefixes from forms 03:354-361 and foundations 06:94 (freeing `fans`, `fopt`, `fpar`, `fdr`); correct the drafts line to point at the responses table. The id table also says 16 prefixes while the paper's backlog counts "16" tables (12:115), consistent, but only 12 of those tables actually have an id.
- Owner: forms 03; foundations 06.

**15. MEDIUM. Interface rule on special-category drafts on the device against forms' draft behaviour.**
- Side A (interface 02-data-model:64): "Form drafts | The unsaved contents of long forms | 7 days | Whatever the form carries; forms with special-category fields are never drafted".
- Side B (forms 06:114): "A person who is not signed in has the draft kept on their device, and may ask for a link by email to continue elsewhere." Forms 07:20: `forms.drafts.keep-for` default 30d. Forms 07:25: `forms.public.special-without-sign-in` can be true, so a signed-out person may be filling a special-category form. Forms 03:185: the server draft is encrypted "because it can hold any class of answer".
- Prevail: interface's device rule is a safety rule; forms should state that a signed-out draft on a form with a special-category question is not kept on the device (or at all), and which retention (7 days, or `forms.drafts.keep-for`) applies to device drafts.
- Owner: forms 06 and 07.

**16. MEDIUM. A signed-out respondent cannot be the "submitter" for revise-when-returned.**
- Side A (forms 07:75): "Derived authority. The submitter may read, revise when returned and withdraw their own response without any ability." Forms 05:131: `forms.submitter` "matched through the account's verified addresses". Forms 08:123 (FB-303.2) says a signed-out person finds a draft on the same device or by emailed link.
- Side B (forms 03:161, 03:172): the only link token is `resume_token_hash` for drafts. A response is keyed to an email address with no account, yet `forms.submitter` and "My forms" work only through a verified address on an account. A signed-out respondent whose response is returned for changes (forms 04:113) has no stated route back to it.
- Prevail: unclear, needs the forms author (and identity). Suggest a returned response issues a fresh token link by email, or `edit_after_submit = when_returned` is refused for placements open to signed-out respondents.
- Owner: forms 03, 04, 07.

**17. MEDIUM. Abilities table does not use the foundations listing format and omits risk and audit.**
- Side A (forms 07:50): columns `Ability | Scope | Allows | Preset holder`.
- Side B (foundations 02-3 lines 126-128): "Part 6 of each specification uses these columns": `Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders`. Foundations 02-3 line 140 adds `audit: 'read'` for reads. Forms' "each view audited" (07:60), "Nobody ... decides ... their own response" (07:72) and "export" are exactly `audit: 'read'`, `owner: 'refuses'` and `risk: 'privileged'` cases; none is declared. `forms.response.read-special` and `forms.response.export` touch personal and special data (privileged by the registry's definition, 02-3 line 59).
- Prevail: foundations format. Add the missing columns (and decide the privileged set, since privileged implies a fresh strong sign-in, which a welfare lead will notice).
- Owner: forms 07.

**18. MEDIUM. Public address of a form is unspecified and may collide with a theatre page.**
- Side A (forms 03:60 `slug` unique; forms 05:44 `forms.link` slot "Someone opens the form's link"). No route is given anywhere in the form-builder specification.
- Side B (foundations 02-formats 116 and the later additions): reserved prefixes are `/account`, `/members`, `/console`, `/live`, `/book`, `/sign-in`, `/setup`, `/api`, `/files`, `/mailing`, `/whats-on`, `/shows`; everything else belongs to the theatre's own pages, and a build check refuses a theatre page under a reserved one. Interface 05-1:101: "A theatre's content page can never collide with a platform page ... because the reserved list is short and fixed."
- If forms serves public forms at `/forms/<slug>` (or similar) that prefix is not reserved, so a theatre could create `site/content/forms/...` and break it; the filler (screen 15) is stated as "Public or members' area" (06:25) with no address.
- Prevail: foundations/interface. Forms should state the address (for example inside an existing shell, or add `/forms` to the reserved list), and the confirmation/"My response" addresses.
- Owner: forms 05/06; foundations 02-formats (if a prefix is added).

**19. MEDIUM. Embedded form and the custom-fields panel: the contribution points do not match what the specification describes.**
- Side A (forms 02-scope:28): "Forms can be embedded in a content page". Forms 05:44: `forms.link` slot covers "an embedded form on a content page". Forms 08:206 FB-509: "Embedding a form in a content page by a content component". Forms 05:104-116 lists what forms contributes to core points; `core.public-component` is not among them.
- Side B (core 05:129, 05:142, point `core.public-component`): "Components a content page may use"; a module contributes entries. Foundations 02-1:240 says public components live in `app/components/public/`; core owns the shape.
- Also forms 05:109 says custom fields reach core records via `core.record-tab` ("The record-fields panel on a core record"), while forms 06:149 says the panel is "a section of the host's record page, read-only until the host's own Edit is used" and 05:71 says `FormsRecordFields` is a component "for hosts to place". Interface 04:86: "A contributed tab receives the record's id and nothing else" and "A tab ... always come after the owner's own tabs". A tab, a section and a host-placed component are three different things.
- Prevail: the interface specification and core for the shape. Forms should add `core.public-component` to its contributions and say which of tab, section or component custom fields use.
- Owner: forms 05, 06.

### LOW

**20. LOW. A foundations question is shown as still being asked.**
- Side A (forms 03:204): "foundations is asked how append-only triggers and erasure coexist."
- Side B (foundations 02-formats 138, ruling "An append-only table may have erasable columns", and forms 05:155): the question is settled ("The trigger allows an update only when every changed column is declared erasable ...").
- Prevail: forms 05:155. Delete the stale clause in 03:204.
- Owner: forms 03.

**21. LOW. Question type list differs from the paper's.**
- Side A (design paper 04-3:21): "Fields: short and long text, number, money, date and time, single and multiple choice, yes or no, phone, email, address, file upload, **signature**, rating." Structure includes "sections" (04-3:23).
- Side B (forms 02-scope:10): "Text, number, money, date and time, choice, yes or no, email, phone, address, file, rating, consent". Forms 08:62 FB-202 lists the same set with no signature. Forms has pages and groups, not "sections".
- Prevail: the paper (a requirement) unless a decision says otherwise; none does. Add "signature" to the "later" list or record its removal; align "sections".
- Owner: forms 02 and 08 (or paper 04-3).

**22. LOW. Shell wording.**
- Side A (forms 06:7): "Shells are the paper's three: public, members' area and console."
- Side B (foundations 02-formats 116): shells are `account`, `members`, `console` and `live`; reserved address prefixes follow. Interface 05-1 draws four frames. Forms' own table then uses "Audience account and members' area" (06:27).
- Fix: "the interface specification's shells (account, members, console, live)".
- Owner: forms 06.

**23. LOW. The client-made id and the example ids break the id rules.**
- Side A (forms 03:144): "The id is made by the client before the first save". Forms 03:35-43 sample: `"id": "q_role"`, option id `"o1"`. Forms 03:98 `forms_fields.id` is "the question id used in definitions" with prefix `ffld` (03:350).
- Side B (foundations 02-formats 'Scoped ids', and 06:58): every id is `<prefix>_<26 characters>`; the kit generates it (`col.id()`); `col.ref` and route validation accept only that table's prefix.
- The example is marked "an illustration, not a schema", but it is copyable. A client-chosen response id also needs to be stated as validated as `fres_` + 26 characters with a uniqueness refusal (otherwise a client could probe for ids). `unique_key` (03:159) keys a one-each response by "the person id", which does not exist for signed-out respondents (03:153).
- Owner: forms 03.

**24. LOW. Receipts for signed-out respondents need core's address-based send.**
- Side A (forms 05:116): "Forms sends with core's notify service inside its own unit of work." Forms 05:120: "Two core services" (vocabularies and files).
- Side B (core 05:68-69): `notify(typeKey, { to, ... })` sends to accounts; `notifyAddress` is "for an address with no account ... Email only". A receipt, "returned for changes" and the emailed resume link for a signed-out respondent must use `notifyAddress`; forms uses a third core service (notifications) and does not name it.
- Owner: forms 05.

**25. LOW. Withdrawal diagram against the guard.**
- Side A (forms 04:79-80, diagram): `pending -->|withdraw| withdrawn` and `returned -->|withdraw| withdrawn` only.
- Side B (forms 04:115): "Withdraw | The submitter, while no final stage is reached", and 04:91 "can be withdrawn until a decision is recorded". An `in_review` response is not final, so it can be withdrawn by the text but not by the diagram.
- Prevail: text. Add `review -->|withdraw| withdrawn`.
- Owner: forms 04.

**26. LOW. Status and counts wording.**
- Forms 01:68 calls itself "Second draft" while the paper's status tab (11:21) says "Draft complete", and forms 01:32 says "6 parts" while its diagram draws seven boxes (the seventh, "modules", is the five plug-in kinds). Forms 10:3 says "the draft already follows the recommendation" though all ten are decided. These are cosmetic; list for tidy-up only.
- Also noticed outside this area: identity 07:3 says "16 abilities" while 07:122 says "That makes 17 rows" (for the identity reviewer).

## Checked and consistent

- Counts inside the area: 16 tables (+ `forms_response_authors` later), 21 screens (9 + 5 + 4 + 3), 20 settings, 14 abilities, 41 stories (27 first release + 14 later), 27 named test cases, ten decisions, ten questions, ten templates. Paper backlog 12:13 (41/0/27/14) and 12:115 (16 tables) agree.
- Prefix list: `frm fver ffld fplc fres fans fopt fstg fasg frev fmsg fpar frun ftpl` (time-sorted) and `finv fdr` (random) match foundations 06:94; `fcoa` matches foundations 06:72; all within the 2 to 4 lower-case letter rule and no clash with other prefixes found.
- Decisions recorded as Matt's: Q1 to Q10 as recommended (review in first release, no automatic production creation, anonymous respondents allowed, special category encrypted and separate ability, edit-after-submit per placement default "only when returned", picked-then-typed calculations, custom fields on production/person/venue, no default retention, scores never reach the applicant, portable forms after first release) agree with forms 04, 07, 08 and the status tab (11:37, 11:97-109).
- Names follow the foundations naming rules: settings `forms.<group>.<name>`, abilities `forms.<noun>.<verb>`, events `forms.<record>.<past participle>`, jobs and tasks `forms.<verb>-<noun>`. Event internal flags (form events not internal, response/review/action events internal) follow the foundations lint.
- Always-on: `switchable: false` agrees with foundations 02-1:64 and 02-formats 108 (but see core 01-overview:36, "each can be off", which lists the form builder among modules that can be off; that is a core error to fix, not forms').
- Conflict lockout as a guard in forms' own service, applied to every role including the Owner, agrees with foundations 02-formats 144 and identity's "allow only" model; grants stop at the form and cover its responses; `core.member` as the one membership fact (identity 05:176).
- Preset roles named in forms 07:48 (`administrator`, `committee-member`, `welfare-lead`, `membership-officer`, `production-lead`, Owner) exist in identity 07:138-172, and "welfare lead alone holds read-special" matches identity 07:170-172. "All three abilities so marked" (create, publish, template.manage) is correct.
- Settings kinds, `audience` values (`public`, `signed-in`, `staff`), `unset` for the retention default, setting rules and presets (`student-society`, `amateur-company`, `small-venue`) match foundations 02-2 and 02-1:220.
- Files and vocabularies: `core_files`, `core.file-slot`, `core.file-access`, `listTerms`, `assertTerm`, `core.vocabulary.manage`, vocabulary key `x.<name>` for a theatre's own all match core 05:48-50, 05:128, 05:152 and core 03:232 and 07:111.
- Interface: Editor layout (outline, canvas, panel, top bar with tabs, saved state, undo/redo, problems count, Preview, Publish; sidebar collapses; second editor read-only or take over; refuse stale save) matches interface 05-2 lines 84-91 and the wireframe SVG text. Steps ("Page 4 of 9") and the Form rules ("(optional)", first invalid field takes focus, button names the act) match. Console group "Forms" is in the interface order. Review queue's two homes and My forms in the audience account and members' area match interface 01-scope:62.
- Wireframes: `06-w1-builder` (tabs, "Problems 2", third question selected, "Depends on") and `06-w2-review` (private comment, "Declare a conflict", locked row text) agree with the prose beside them; both Mermaid diagrams use the same stage kinds and form statuses as the tables except where noted in findings 4 and 25.
- Erasure and merge events: forms listens to no erasure event (handled by the registry and `core.erasure-handler`), and the merge/claim events `core.account.merged` and `core.account.claimed` exist in identity 05:126-129. Unit-of-work rule (`addResponse` never commits) agrees with foundations and box office 05:15.
- Design paper requirements covered by forms: versions and responses tied to their version, a data class on every field, drafts and resuming, windows, caps, one response per person, workflows with private scores, declared and automatic conflicts, test mode and undo, custom fields as the same engine, retention for unsuccessful proposals, and the five of six Programming capabilities (the sixth, a season planner, is explicitly not covered).
