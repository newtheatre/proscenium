# 7. Stories

Thirty stories, GV-01 to GV-30 (a new prefix; no other spec uses GV). Eleven are the gate, fourteen the first release (including meetings and actions, by Matt's answer to question 6, and reporting to the upstream project, by his answer to 5b) and five later. Each criterion is written to become a failing test before the code.

## Gate

What a theatre needs to switch Governance on and retire a hand-kept committee list and an email-only route for problems. For NNT, the gate replaces `content/committee.yml` and the feedback queue of the old system.

**GV-01 Bodies and posts.** As an administrator I set up who governs the theatre.

1. A body has a name, description and order; archiving one hides it from the public page and refuses new terms.
2. A post has a key, name, description, role address, seats (1 to 20), term rule, electable flag, requirements and order. A duplicate key is refused inline.
3. A post whose rule is `year_end` cannot be saved while `core.organisation.year-end` is unset; the message links to the organisation page.

**GV-02 Record a term.** As someone with `governance.term.manage` I record who holds a post.

1. The end date fills from the post's rule and can be changed; it cannot be before the start.
2. Recording more holders than seats for overlapping dates is refused, naming the holders in the way. Two people recording the last seat at once: exactly one succeeds.
3. A holder who fails a requirement is refused with the requirement's own reason.
4. Recording a term for one's own account is refused; an Owner may.

**GV-03 End a term.** As above, or as the holder resigning.

1. Ending early takes a reason from the fixed list and a last day not after the planned end.
2. The holder can resign from "Your posts" from today onwards, and cannot change past dates.
3. When the post then has fewer holders than seats, `governance.post.vacant` is announced once.
4. "Recorded in error" removes the term from history views and it never counted as in office.

**GV-04 Office brings authority.** As a theatre I map abilities to holding a post or being on a body.

1. `governance.post-holder` and `governance.member-of` appear on Identity's roles screen and can be pinned to one post or body. (Depends on Identity resolving pinned mappings.)
2. An ability mapped to the Treasurer post works for the holder from the first moment of `starts_on` and stops at the end of the last day, London time, across both clock changes.
3. Ending a term early removes the authority on the next request; no grant is created or revoked.

**GV-05 Public committee page.** As a visitor I see who runs the theatre.

1. `::committee` lists the body's posts in order with each role address; a holder's name shows only with their agreement, otherwise the post's name; a vacant post says "Vacant".
2. `:post{key field}` renders inline; CI refuses an unknown key.
3. From the end of the grace period after a year end until a term of the new year is recorded, the page says it may be out of date (when the setting is on).
4. The page shows the date of the last change to a listed term.

**GV-06 Listing consent.** As a holder I choose whether my name is public.

1. A new term starts as the listing default; with `ask`, the term-started message asks.
2. The holder can change name shown, display name and a short line at any time; withdrawal shows on the next render.
3. Staff recording consent on the holder's behalf are recorded as `agreed_by`.

**GV-07 Register a document.** As a document manager I add a document to the register.

1. A document needs a kind, a title and exactly one owner (a post or a person).
2. A version is a file upload; numbers run 1, 2, 3 with no gaps even when two people upload at once.
3. Visibility defaults to staff; members and public need the right ability.

**GV-08 Sign off and review.** As a signer I approve a version or confirm it needs no change.

1. Only the latest version can be approved; signing sets the next review date from the period.
2. With `separateSigner`, the uploader of that version cannot approve it (Owner exempt).
3. "Reviewed, no change" signs the current version again and moves the review date.

**GV-09 Reviews come due and lapse.** As an owner I am told before a document lapses.

1. A document enters "Review due" at the warning period and its owners get one digest a day at most.
2. The day after the review date it shows "Lapsed" and `governance.document.lapsed` is announced once.
3. A post-owned document's reminders go to whoever holds the post on that day.

**GV-10 Send feedback.** As staff in the console or on a live screen I report a problem or an idea.

1. The sheet takes a kind and words; the page path (no query string), shell, module, browser and up to ten recent failed requests are attached.
2. More than the daily limit is refused with the time it resets.
3. Sending never navigates away or interrupts a live screen.

**GV-11 Triage feedback.** As a triager I work the queue.

1. The queue lists new reports first with their context; a report moves to acknowledged, forwarded (with a link), done or dismissed, and never back to new.
2. Two triagers acting on one report: the second is told it has moved.
3. Reading the queue is audited; `governance.feedback.received` carries no words.

## First release

**GV-12 Handover packs open.** A pack opens for each post `opens-before` its term ends (or for a vacant post before the year end), once per post and year, with the post's checklist copied in, and the outgoing holder is told.

**GV-13 Write the pack.** The outgoing holder writes notes (Markdown), ticks and adds items, sees the post's documents live, and marks it ready; contributed sections are frozen with their time; a failing section reads "Not available".

**GV-14 Receive the pack.** The incoming holder is told when the pack is ready or when their term starts, whichever is later, and marks it received; the outgoing holder loses access at the end of the grace period; an unready pack is made ready by the task at that point.

**GV-15 Document kinds from other modules.** A kind declared by a module that is on can be created on its record type; a kind from a module switched off is hidden, its documents kept and readable by managers.

**GV-16 Documents tab and readiness.** Every record type a kind attaches to gets a Documents tab, and each `required` kind adds one readiness line that is done only while a current, unlapsed document exists.

**GV-17 Office as a requirement.** `governance.member-of:<body>` and `governance.post-holder:<post>` are offered as `core.requirement` sources, so a duty, a competency or a price can require office, with the refusal "This is for the Committee".

**GV-18 Elections start terms.** Governance contributes `governance.post` to `elections.subject`; a final result records each winner's term in the same unit; a seat clash fails the declaration with both names.

**GV-19 Committee audiences.** Communications can address a body's or a post's current holders; recipients are read by subquery, never an id list.

**GV-20 Health checks, home cards and figures.** Out-of-date committee, vacancies, lapsed documents and holders no longer meeting requirements show in health; owners and triagers get home cards; the four figures answer `core.measure`.

**GV-21 Policies tracked in the register.** A register document can track a public policy; signing it records the `core_policy_versions` row reviewed; a new policy version makes the document "New version waiting for sign-off".

**GV-22 Your posts.** The account section lists current and past terms, the listing choice, resignation and the handover pack.

**GV-23 Meetings.** As someone with `governance.meeting.manage` on a body I run its meetings from notice to approved minutes. (First release by Matt's answer to question 6, 24 November 2026.)

1. A meeting has a body, a kind (ordinary, annual general, extraordinary), a title, a start and end in theatre time, a place (a space or free text) and an optional online link. It starts as a draft that only managers see.
2. Agenda items have a title, an optional presenter (a post or a person), notes and an order that can be dragged. "Apologies", "Minutes of the last meeting" and "Matters arising" are added to every new agenda; "Matters arising" lists the body's open actions live.
3. "Send agenda" tells every current holder in the body, with the agenda and a calendar file. Sending later than `meetings.agenda-notice` before the start asks for a reason, which is shown on the agenda; it is never refused.
4. A holder can send apologies from the notice or Your meetings until the start. On the day a manager records each expected person as present, apologies or absent, and can add guests by name with no account.
5. When the body has a quorum and fewer holders are present, the meeting is marked "Inquorate" on its page and minutes; nothing is refused.
6. Marking the meeting held opens the minutes: a `governance.minutes` document on the meeting with a draft written from the agenda, attendance and actions. Minutes still unwritten `meetings.minutes-due` after the meeting show on the body's health.
7. Minutes are approved by sign-off (GV-08) at a later meeting, from its "Minutes of the last meeting" item, or by a signer outside a meeting; once approved they are fixed and a correction is a new version.
8. A meeting can be cancelled before it is held with a reason; everyone told of the agenda is told of the cancellation and its busy times are removed.

**GV-29 Action items.** As a meeting manager or the person named I track what a meeting agreed.

1. An action has words, an owner (a post or a person), an optional due date, and the meeting and item it came from; it can also be added between meetings.
2. The owner is told when it is given to them and `actions.reminder` before it is due; a post-owned action goes to whoever holds the post that day.
3. The owner or a manager marks it done or dropped with an optional note; neither can be undone, and a new action replaces it.
4. Your actions lists a person's open actions across bodies, overdue first. A post's open actions are a section of its handover pack.
5. An action whose owner leaves office stays with the post; one owned by a person who leaves every post of the body shows as "Needs a new owner" to managers.

**GV-30 Report problems to the Proscenium project.** As an administrator I choose whether bug reports also reach the open-source project. (First release by Matt's answer to question 5b, 24 November 2026.)

1. `governance.feedback.upstream` is off by default and set on the Feedback settings page, with a plain description of what is sent.
2. When it is on, each bug report (never an idea) is sent upstream by the queue with its technical context only: release, module, page path, shell, browser and the failed requests' route patterns and status codes. No account, name, email or organisation name.
3. The reporter's words go only when they tick "Also send my words to the Proscenium project", shown only while the setting is on and unticked by default.
4. The report shows "Sent to the Proscenium project" with the upstream reference, or "Not sent" after the last retry; a failure never affects the local queue.
5. Turning the setting off stops sending at once; nothing already sent is recalled.

## Later

**GV-24 Your reports.** A reporter sees the state of their own feedback and a reply from the triager.

**GV-25 Past committees.** A public archive of each committee year's listed holders, from terms, with the same consent.

**GV-26 Import a committee.** Bodies, posts and terms from a CSV, with each row checked as GV-01 and GV-02 check one.

**GV-27 Register of interests.** Trustees and committee members declare interests (another body, a supplier) with review dates, as charities are expected to keep.

**GV-28 Trustee declarations.** A post can require a yearly signed declaration (fit and proper person, code of conduct) as a document of a declared kind per term.

## Order of building

GV-01 and GV-02 first, then GV-04 once Identity resolves pinned facts, then GV-05 and GV-06 together. The register (GV-07 to GV-09) and feedback (GV-10, GV-11) are independent of posts and can be built in parallel by another stream. Productions needs GV-15 and GV-16 before its risk assessments; Elections needs GV-18. Meetings (GV-23) need the register's sign-off (GV-08) for minutes and come before actions (GV-29); GV-30 follows GV-10 and needs the upstream project's intake to exist.
