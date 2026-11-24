# 4. Interface to other modules

Governance meets other modules only through the Foundations mechanisms: facts, points it offers, points it contributes to, services, events and core's record resolver. It reads no other module's tables, and no module reads its tables.

## The manifest

| Field | Value |
| --- | --- |
| Id | `governance` |
| Requires | `core` |
| Uses | `elections`, `communications`, `reports` (each soft: Governance contributes to their points when they are on and does nothing otherwise) |
| Record types | `governance.body`, `governance.post` (parent `governance.body`), `governance.term` (parent `governance.post`), `governance.handover-pack` (parent `governance.post`), `governance.document`, `governance.feedback` |
| Facts | `member-of`, `post-holder`, `handing-over` |
| Points offered | `governance.document-kind`, `governance.handover-section` |
| Tasks | `governance.open-handovers` (daily 06:00), `governance.document-reviews` (daily 07:00), `governance.check-holders` (daily 07:30) |
| File slots | `governance.document` / version; `governance.term` / photo; `governance.handover-pack` / attachments |
| Menu | One console group, Governance: Committee, Documents, Handover, Feedback. Settings through the cog modal, Admin > Modules |
| Presets | Ability suggestions for Identity's existing preset keys only (ruling R-03); no new role |

## Facts

| Fact | On | Standing | Pin | Holders | Default abilities |
| --- | --- | --- | --- | --- | --- |
| `governance.member-of` | `governance.body` | Yes | Yes | Yes: current holders of any post of the body | `governance.term.view`, `governance.document.view` |
| `governance.post-holder` | `governance.post` | Yes | Yes | Yes: current holders of the post | `governance.handover.write` |
| `governance.handing-over` | `governance.post` | No | Yes | Yes | `governance.handover.write` |

`holders` lets Communications, Front of house and others reach "the committee" without a role. NNT's "the committee may staff the bar untrained" and "a duty manager shift needs a live committee role" (NNT decisions 0115, 0259, 0263) become requirements that name `governance.member-of` through `core.requirement` (below), not role lists.

## Points Governance offers

**`governance.document-kind`** (data). Each module declares the kinds of document it keeps in the register.

| Field | Meaning |
| --- | --- |
| `id` | `<module>.<name>`, such as `productions.risk-assessment` |
| `label` | Translation key |
| `attachesTo` | A record type, or absent for a standalone document |
| `reviewEvery` | A duration setting key, or null for a document never reviewed (a licence filed for the record) |
| `signOffAbility` | An ability checked on the attached record, or absent for a kind that is only filed |
| `separateSigner` | Boolean: the uploader of a version may not approve it |
| `required` | Boolean: the attached record's readiness list asks for one |
| `createAbility` | An ability on the attached record that lets someone create and upload without `governance.document.manage` |
| `mayBePublic` | Boolean, default false |
| `template` | Optional path to a starter file in the module's layer, offered for download |

Governance declares its own kinds on its own point: `governance.policy` (standalone, review every `governance.documents.default-review`, sign-off `governance.document.sign-off`, may be public), `governance.minutes` (standalone, no review, sign-off, may be public), `governance.constitution` (standalone, no review, sign-off, may be public), `governance.other` (standalone, review optional, no sign-off). Agreed this round: Productions' `productions.risk-assessment` (attaches to `core.production`, sign-off `productions.risk-assessment.sign-off`, required) and `productions.licence-agreement` (attaches to `core.production`, filed only).

**`governance.handover-section`** (code). Agreed with Reports on 23 November 2026.

```ts
defineHandoverSection({
  label: 'reports.handover.numbers',   // translation key
  order: 20,
  ability: 'reports.report.view',      // checked on the governance.post record; without it the reader sees nothing of the section
  render: async ({ postId, committeeYear: { from, to } }) => ({ blocks: [
    { kind: 'text', text },
    { kind: 'figures', rows: [{ label, value, unit }] },
    { kind: 'links', rows: [{ label, href }] },
  ] }),                                 // or null: nothing for this post
})
```

Blocks hold aggregates and links only, never a person's data, because a pack is read by the next holder. Governance contributes three sections of its own: documents this post owns (with their state), open feedback the post's holder sent (if any), and terms of this post in the year. Reports contributes "Numbers for this post", running each report pinned to the post.

## Services

| Service | Answers | Callers |
| --- | --- | --- |
| `listPosts({ body?, electable? })` | Live posts: id, key, name, seats, term rule | Elections' subject kind (Governance's own code), Communications' audience picker |
| `nextTerm(postId)` | `{ from, to }`, London dates | Elections (agreed) |
| `currentTerms({ postId } or { bodyId })` | Holders now, with listing consent | The public page, the content tokens |
| `documentsForRecord(type, id)` | Documents attached to a record, with state | Governance's own record tab and record check; a module that `requires` Governance |

Services are plain named exports of the module's server code, as built elsewhere (`listTeam`, `readMeasure`), per integration ruling R3-09.

A module that only `uses` Governance does not call its services; it relies on Governance's contributions to core points and on events, as Productions does.

## Contributions to other points

| Point | Owner | Contribution |
| --- | --- | --- |
| `elections.subject` | Elections | Kind `governance.post`: options lists electable posts; describe gives the name; seats gives the seat count; candidateRefs gives the post's requirements; apply records each winner's term inside the passed unit, source `elections.result:<id>` |
| `core.requirement` | Core | Source `governance.member-of:<body id>` ("Is on the Committee") and `governance.post-holder:<post id>` ("Holds the post Treasurer"), met while the account holds the fact. A training competency, a duty or a price can then require office |
| `core.record-tab` | Core | A Documents tab on every record type some declared kind attaches to, listing its documents with a "New <kind>" action per kind the reader may create |
| `core.record-check` | Core | One line per kind with `required: true` on its record type: done when a document of the kind has a current version that has not lapsed. `needed` follows the kind |
| `core.home-card` | Core | "Your handover" (open pack); "Documents due" (owner); "Feedback waiting" (triage) |
| `core.health-check` | Core | Committee page may be out of date; posts vacant; documents lapsed; post holder no longer meets a requirement |
| `core.account-section` | Core | "Your posts": current and past terms, listing consent, resignation, the pack |
| `core.navigation` | Core | The console group and the public Committee link |
| `core.record-resolver` | Core | Title and link for each record type above |
| `core.privacy-record` | Core | The committee listing; feedback reports |
| `core.setup-step` | Core | "Who runs your theatre": add a body and its posts. Optional |
| `core.measure` | Core (contract from Reports) | `governance.documents-overdue`, `governance.documents-lapsed` (level, by `governance.document-kind`), `governance.feedback-open` (level), `governance.posts-vacant` (level, by `committee-year`) |
| `communications.audience-source` | Communications | `governance.body-members` (a body's current holders), `governance.post-holders` (one post's). Accounts are read by subquery from the fact's holders, never as an id list |
| `core.quick-action` | Core | "Send feedback" in the console and live shells until Interface gives the button a fixed place |

Agreed with Availability (23 November 2026): Governance contributes one group per live body to `availability.group`, id `governance.body:<id>`, members = the body's current post holders (read through the `member-of` fact's holders), `canPlan` true for a current holder of a post in that body. Agreed again on 24 November 2026, after meetings moved into the first release: Governance contributes the target "Committee meeting" to `availability.target`, offered only for `governance.body` groups; choosing a time opens a draft meeting prefilled with the body, time, space and invitees. Availability hides its own arranged-meeting target for those groups (its rule F9, story AV-29), so a committee occasion exists only once, as a Governance meeting; its arranged meeting stays for every other group. Governance writes its own `core.person-busy` rows (source `governance`, the module id as C-66 requires, with the meeting id in the row's reference field for expected attendees when the agenda is sent and removes them on cancellation. Neither module reads the other's tables.

## Content tokens

A module's layer may add content components, as core's policies do (`:setting`, `:fact`). Governance adds:

- `::committee{body="committee"}`: the table of posts and current holders for a body, in post order, with the role address as a mail link, names only where the holder agreed, and the date of the last change.
- `:post{key="treasurer" field="name"}` and `field="address"`: one post inline. With nobody listed it reads the post's name ("our Treasurer"), never a blank.
- The CI content check refuses a `key` with no live post, as NNT's check refuses an unknown committee token (NNT decision 0107). Because posts are data in the site, not files, the check reads them from the seed or a snapshot; at runtime an archived post renders the post name only.

## Events announced

| Event | Payload | External (webhook) |
| --- | --- | --- |
| `governance.term.started` | `{ termId, postId, bodyId, capacity, startsOn }` | No |
| `governance.term.ended` | `{ termId, postId, endedOn, reason }` | No |
| `governance.post.vacant` | `{ postId, vacancies }` | No |
| `governance.handover.ready` | `{ packId, postId }` | No |
| `governance.handover.received` | `{ packId, postId }` | No |
| `governance.document.filed` | `{ documentId, versionId, kind, recordType, recordId }` | No |
| `governance.document.signed-off` | `{ documentId, versionId, kind, recordType, recordId, signedAt }` | No |
| `governance.document.review-due` | `{ documentId, kind, nextReviewOn }` | No |
| `governance.document.lapsed` | `{ documentId, kind, recordType, recordId }` | No |
| `governance.feedback.received` | `{ feedbackId, kind, shell, module, pagePath }` | Yes: a theatre may forward reports to its own tracker |

**Added for meetings and actions (first release).** Events: `governance.meeting.agenda-sent {meetingId, bodyId, startsAt}`, `governance.meeting.cancelled {meetingId, bodyId}`, `governance.meeting.held {meetingId, bodyId, quorumMet}`, `governance.minutes.approved {meetingId, documentId}`, `governance.action.assigned {actionId, bodyId, dueOn}` and `governance.action.closed {actionId, state}`. All are webhook-eligible; none carries names, agenda words or action words. Notifications: agenda sent (with an `.ics` file), meeting changed, meeting cancelled, action assigned, action reminder and the daily overdue digest, each through Communications' transactional path. Governance also contributes a handover section "Open actions" to its own `governance.handover-section` point and a health check "Minutes not written" after `meetings.minutes-due`. Service: `openActions({ownerAccountId})` for the account home card, a plain named export as R3-09 asks.

**Calendar feed (C-70).** Governance contributes `core.calendar-feed` with id `governance.meetings`. `events(accountId, from, to)` returns the meetings in that window of every body where the account is expected or currently holds a post, from the moment the agenda is sent (drafts never appear). Each event: `key` the meeting id; `startsAt` and `endsAt` from the meeting; `title` the body's name and the meeting's kind only, such as "Committee: ordinary meeting", never agenda words, since feed titles must be public-safe; `location` the space's name or the place text, never the online link; `status` confirmed, or cancelled once cancelled; `transparent` true when the account has sent apologies. Bodies are read by subquery, never an id list.

**Reporting to the upstream project (GV-30).** The one outbound call Governance makes. When `governance.feedback.upstream` is on, a queue consumer posts each bug report to the upstream project's intake, an HTTPS address fixed in the code (a fork may change it in code; it is not a setting and needs no Worker secret, since the intake takes anonymous reports). The body is the release, module, page path, shell, browser and the failed requests' route patterns and status codes, plus the words only when the reporter ticked the box. Three retries with backoff, then `upstream_state = 'failed'`. The intake itself belongs to the upstream project, not to this module; until it exists the setting stays hidden.

Account ids are left out of payloads; a listener that needs the holder asks through the fact's holders.

## Events heard

None. Elections starts terms through `apply`, not an event, so the term and the result commit together.

## Notification types

| Type | To | When |
| --- | --- | --- |
| `governance.handover-opened` | Outgoing holder | A pack opens |
| `governance.handover-ready` | Incoming holder | The pack is ready, or their term starts after it was |
| `governance.handover-received` | Outgoing holder | The incoming holder received it |
| `governance.term-started` | The holder | Their term starts: the post, its dates, the pack, listing consent |
| `governance.term-ending` | The holder | When the pack opens, if they have no later term of the post |
| `governance.document-review-due` | The owner (every holder of an owner post) | Entering the warning period; one digest a day per person |
| `governance.document-lapsed` | Owner; holders of `governance.document.manage` | The day after the review date |
| `governance.feedback-waiting` | Holders of `governance.feedback.triage` | Daily digest when reports are new. Off by default for each person |

## What Governance needs from others

| From | Need | Status |
| --- | --- | --- |
| Identity | Pinned fact mappings resolved (`pinned_record` non-empty) | Specified, not built |
| Interface | A fixed place for the feedback button in the console and live shells, and the recent-failures buffer the client keeps | To agree |
| Public site | Committee components registered like the policy components | Pattern built |
| Elections | `elections.subject` with `apply(unit, ref, result)` | Agreed |
| Reports | `core.measure` contract; "Numbers for this post" section | Agreed |
