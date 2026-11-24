# 3. States and rules

Four records have a life cycle: a term, a handover pack, a document and a feedback report. Each change below names the rule that guards it. Every guarded write puts its predicate on the statement itself (decision 0003's conditional write), so two people acting at once cannot both succeed.

## A term of office

A term is **upcoming** before `starts_on`, **in office** from the start of `starts_on` to the end of its last day, and **ended** after. The last day is `ends_on`, or `ended_on` when an end row exists, whichever is earlier. A term recorded in error ends with reason `recorded-in-error` and `ended_on` the day before `starts_on` (the one case that date is allowed), so it never held office and history views leave it out.

*Drawing: recording a term (rules T1 to T3) and its life cycle*

| Change | Who | Rule |
| --- | --- | --- |
| Record a term | `governance.term.manage` on the post | **T1 Seats.** The insert succeeds only if fewer than `seats` distinct accounts hold terms of the post overlapping the new term's dates (a count inside the `INSERT ... SELECT`). Acting holders take a seat. **T2 Requirements.** Each of the post's requirements is checked through `core.requirement` for the holder when the term is recorded; one not met refuses with its reason. **T3 Not yourself.** Nobody records a term for their own account, except an Owner (Matt, 23 November 2026). **T4 Dates.** `ends_on` defaults from the post's term rule: `year_end` gives the next `core.organisation.year-end` on or after `starts_on`; `days` adds `term_days` less one; `open` leaves it null. A `year_end` post with the year end unset refuses with the remedy Identity gives |
| Start a term from an election | Elections' `apply`, inside its unit | T1, T2 and T4 apply; T3 does not. `source` is `elections.result:<id>`; `recorded_by` is the person who declared the result. If T1 fails the whole declaration fails, so a result never claims a seat it could not take |
| End early | `governance.term.manage` on the post | **T5.** One end row per term (key). `ended_on` is not before `starts_on` and not after `ends_on`. Ending takes effect at the end of `ended_on`: choosing today ends authority at midnight, choosing yesterday ends it now. T3 applies |
| Resign | The holder, with no ability | **T6.** A holder may end their own term with reason `resigned`, from today onwards only. This is the one self-service write on a term |
| Become vacant | Automatic | **T7.** When a term ends early and the post then has fewer holders than seats for the rest of the committee year, `governance.post.vacant` is announced once, with `{ postId, vacancies }`. A post that reaches its year end is not vacant: handover covers it |
| Agree to be listed | The holder, or staff with `governance.term.manage` recording the holder's word | **T8.** Writes `show_name`, `display_name`, `bio`. The holder may withdraw at any time; it takes effect on the next page render |

**Authority.** The fact `governance.post-holder` holds for an account on a post while one of its terms of that post is in office; `governance.member-of` holds for a body while any of its terms on any post of the body is in office. Both are standing facts (they open the members' area) and both declare `pin: true`, so a theatre can map abilities to one post (the Treasurer gets Finance's period close) or one body. `governance.handing-over` holds for the outgoing holder of a post from the pack opening until the grace period ends after their term, and maps by default only to the handover abilities. Facts are worked out on each request and stored nowhere.

**Requirements later in the term.** A holder who stops meeting a requirement (their membership lapses) keeps the term: the health check "Post holder no longer meets a requirement" lists them for staff to act on. Question 4 asks Matt.

## A handover pack

*Drawing: handover pack · 3 states across the end of a term (not to scale)*

The pack opens before the term ends and closes to the outgoing holder a month after; the incoming holder keeps it.

| Change | Who | Rule |
| --- | --- | --- |
| Open | Task `governance.open-handovers`, daily | **H1.** For each live post whose current term (or, if vacant, whose committee year) ends within `governance.handover.opens-before`, insert a pack for (post, next `year_from`) if none exists (unique key). Copy the post's live checklist items. Tell the outgoing holder |
| Write | `governance.handover.write` on the post (default: facts post-holder and handing-over) | **H2.** Notes, ticks and added items are writable while the pack is `open` or `ready`; a `received` pack is read-only except for ticking items, which either holder may still do |
| Mark ready | The outgoing holder, or `governance.handover.manage` | **H3.** `open` to `ready`. Each contributed section is rendered once and stored in `governance_handover_sections`; a section that fails is stored as "Not available" with the time, and the pack still becomes ready. Tells the incoming holder if one is recorded, else waits for `governance.term.started` on the post |
| Receive | The incoming holder | **H4.** `ready` to `received`, only by an account holding the incoming term. Tells the outgoing holder |
| Close to the outgoing holder | Automatic | **H5.** The handing-over fact ends `governance.handover.grace` after the outgoing term's last day, whether or not the pack was received |

A pack still `open` when the grace period ends is marked ready by the task, so the incoming holder still gets the checklist and the sections.

## A document

*Drawing: document life cycle · 5 states, derived from dates and sign-offs*

Only a sign-off moves a document forward; time alone moves it towards lapsed.

State is derived, never stored:

| State | When |
| --- | --- |
| Draft | No version yet, or no version signed off (for a kind that needs sign-off) |
| Current | Has a current version and `next_review_on` is later than today plus `governance.documents.due-warning` (or is null) |
| Review due | `next_review_on` is within the warning period |
| Lapsed | `next_review_on` is before today |
| Retired | `retired_at` is set |

| Change | Who | Rule |
| --- | --- | --- |
| Create | `governance.document.manage`; or the kind's create ability on the attached record | **D1.** The kind must be declared by a module that is on. A kind that `attachesTo` a record type needs `record_type` and `record_id` of that type; a standalone kind refuses them. Exactly one owner (post or person). Visibility `public` only for kinds that allow it |
| Upload a version | The owner (by post: any holder of the post), or `governance.document.manage` | **D2.** Number is one more than the highest, by conditional insert. A new version does not replace the current one until it is signed off; the register shows "New version waiting for sign-off" |
| Sign off | The kind's `signOffAbility` on the attached record, or `governance.document.sign-off` for Governance's own kinds | **D3.** Only the latest version may be approved. **D4.** When the kind declares `separateSigner`, the uploader of that version may not approve it (owner refuses; Owner exempt). **D5.** `next_review_on` becomes the sign-off date plus the document's or the kind's period, in the same batch |
| Review unchanged | As D3 | **D6.** Signs the current version again as `reviewed-unchanged`; D5 applies. Not offered on a draft |
| Lapse | Automatic, from the day after `next_review_on` | **D7.** Derived, so nothing is written; task `governance.document-reviews` announces `governance.document.lapsed` once per review date and tells the owner and document managers |
| Retire | `governance.document.manage`, or the owner | **D8.** Sets `retired_at`. A retired document leaves every readiness line; it stays readable to those who could read it |
| Make public | `governance.document.publish` | **D9.** Privileged and fresh: publishing is outward-facing. The file's access becomes public in the same batch |

**Policies.** A document with `policy_id` tracks a public policy page. Its versions point at `core_policy_versions` rows instead of files; signing one off records that the theatre reviewed that version of the policy. This is the "review marks tied to a version" the site policies work left unbuilt.

## A feedback report

`new` goes to `acknowledged`, `forwarded`, `done` or `dismissed`; `acknowledged` and `forwarded` go to `done` or `dismissed`. Nothing returns to `new`.

*Drawing: feedback report · 4 states, rules F2 and F3*

| Change | Who | Rule |
| --- | --- | --- |
| Send | `governance.feedback.send` | **F1.** Rate-limited per account like every write that takes free text: at most `governance.feedback.per-day` a day. The words are required; the page path, shell, module and recent failures are attached by the client and checked by the server (the path must match a known route) |
| Triage | `governance.feedback.triage` | **F2.** Each move is a conditional update on the current state, so two people triaging at once cannot both act. `handled_by` and `handled_at` are set on the first move out of `new` |
| Forward | As F2, or a webhook receiver writing back through the API with a credential holding the ability | **F3.** Sets `forwarded_ref` (a URL) and state `forwarded`. The event `governance.feedback.received` carries no words, which are personal data; a receiver fetches them through the API under the ability |
| Remove | Retention | **F4.** Rows older than `governance.feedback.keep-for` are deleted by the core sweep |

## Meetings and actions

In the first release by Matt's answer to question 6 (24 November 2026).

*Drawing: meeting life cycle · 5 states; action life cycle · 3 states*

**Meeting rules.**

- **M1.** Only a draft can be edited freely. After the agenda is sent, changing the time, place or an item tells everyone who was sent it, once per change, with what changed.
- **M2.** Sending the agenda inside `meetings.agenda-notice` before the start needs a reason, shown on the agenda. It is never refused: an urgent meeting must still be possible.
- **M3.** Who is expected is fixed when the agenda is sent: the body's current holders at that moment, read by subquery. A holder whose term starts later is added on request; one whose term ends stays as expected.
- **M4.** Apologies are open to an expected holder until the start. Attendance is recorded from the start onwards by a manager, and can be corrected until the minutes are approved.
- **M5.** Marking held is allowed from the start onwards. If the body has a quorum, `quorum_met` is set by counting distinct present holders; an inquorate meeting is labelled, never refused.
- **M6.** Marking held creates the `governance.minutes` document (owner: the body's minutes post when one is set on the body, otherwise the person who marked it held) with a draft from the agenda, attendance and actions. Approving it is ordinary sign-off (GV-08) and moves the meeting to minutes approved in the same batch.
- **M7.** Cancelling is only from draft or agenda sent, takes a reason, tells everyone sent the agenda, and removes the meeting's `core.person-busy` rows in the same batch.
- **M8.** Reserved items are left out of anything sent to non-members and out of public minutes; members of the body see them.

**Action rules.**

- **X1.** An action has exactly one owner, a post or a person. A post-owned action belongs to whoever holds the post on the day it is read, so it survives a handover.
- **X2.** Done and dropped are final; the claim is a conditional write on `state = 'open'`, so two people closing it at once leave one result.
- **X3.** The reminder is sent once, `actions.reminder` before the due date, and an overdue digest at most once a day to the owner.
- **X4.** When a person-owned action's owner holds no post of the body any more, it shows as "Needs a new owner" to managers; it is never moved automatically.
