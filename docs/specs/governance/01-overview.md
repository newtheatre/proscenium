# Governance: module specification

Nov 23, 2026 · @Matthew Adcock

Governance records who runs the theatre and keeps its paperwork honest. It is a new switchable module, `governance`, spec 6 of the third round, with story prefix **GV** and table prefix `governance_`. It covers five things: committee and board posts with terms of office (and the public committee page built from them), meetings of those bodies with agendas, attendance, minutes and actions, a handover pack per post, one document register with owners, review dates and sign-off that other modules attach to, and feedback sent from inside the app.

## What it is for

- **Posts and terms.** A theatre lists its bodies (a committee, a board of trustees) and their posts, each with a number of seats. A term of office says who holds a post, from when to when. Holding a post is a fact, so the authority it brings starts and stops with the term and nobody has to remember to revoke anything.
- **The public committee page.** Built from current terms, never from permission grants. A holder's name shows only with their agreement; the post and its role address always show. The page says when it may be out of date, as NNT's does today.
- **Handover packs.** Six weeks before a term ends, the system assembles a pack for the post: the outgoing holder's notes, a checklist carried from year to year, the documents the post owns, open items, and last year's numbers from any module that contributes a section. The incoming holder marks it received.
- **The document register.** One register for policies, minutes, risk assessments, licences and anything else with an owner and a review date. A document has versions (files), an owner (a post or a person), a review cycle and sign-offs. Other modules declare their own kinds and get a Documents tab and a readiness line on their records without reading Governance's tables.
- **Meetings.** A body's meetings from draft to approved minutes: agenda and notice, apologies, attendance and quorum, minutes kept as a register document, and actions with owners and reminders that carry into handover packs. Find a time in Availability can open one prefilled.
- **Feedback.** A button in the console and live shells records a bug or an idea with the page, shell and browser attached. Staff triage it in a queue, and an event lets a theatre forward reports to its own tracker.

## What changed in the third round

| Ruling | Effect here |
| --- | --- |
| Elections split from Governance (map doc, Overview) | Governance owns posts and terms; Elections owns contests, ballots and counts and starts terms through a point Governance contributes to |
| One document register (map doc, Overview) | Productions' risk assessments, Inventory's certificates and Governance's own policies and minutes are one table, kinds declared by each module |
| Honours such as fellowships (catalogue's Governance list) | Stay with Membership and Awards, which already build them |
| Public policies are Markdown in the repo (site policies, PRs 493, 498, 504) | The register does not hold policy text; a register document may point at a policy page so its review is tracked against a version |

## Decisions it rests on, cited not re-argued

- Roles end at the committee year end; authority on the night derives from facts, never from a standing grant (decision 0009; Identity ID-24, ruling R-09: one setting, `core.organisation.year-end`).
- Preset roles stay at fifteen (ruling R-03). Governance adds no preset role; its abilities map onto Identity's existing keys and onto its own facts.
- The owner of a record never approves their own action, except a holder of the Owner role (Matt, 23 November 2026).
- Erasure is anonymisation; every domain date is in the theatre's time zone; ids scope by subquery and bound parameters chunk at 90.

## The main choices, in brief

1. **A post confers authority through facts, not grants** (`governance.member-of` on a body, `governance.post-holder` on a post). Question 1 asks Matt to confirm.
2. **Names on the public page need the holder's agreement** by default. Question 2.
3. **Meetings with agendas, attendance, minutes and actions are in the first release.** Matt's answer to question 6 (not the recommendation). Minutes are register documents, so they share versions and sign-off.
4. **Feedback stays in the app** with an event for forwarding; no tracker token in the Worker (lesson from NNT's decision 0086). Question 5. A theatre may also opt in to sending bug reports, without personal data, to the Proscenium project; the reporter's words go only if they tick a box (Matt's answer to question 5b, story GV-30).

## Agreed with other threads (23 November 2026)

| Thread | Agreed |
| --- | --- |
| Elections | Elections owns the point `elections.subject`; Governance contributes kind `governance.post` whose `apply` starts each winner's term inside the unit that makes the result final. Governance offers `nextTerm(postId)` and announces `governance.post.vacant` |
| Productions | Productions declares kinds `productions.risk-assessment` and `productions.licence-agreement`; Governance contributes the Documents record tab and a readiness line per required kind; Productions closes tasks from `governance.document.signed-off` |
| Reports | Governance contributes four figures to `core.measure`; Reports contributes "Numbers for this post" to `governance.handover-section` |
| Inventory | May declare document kinds for certificates; its inspections stay its own records |
