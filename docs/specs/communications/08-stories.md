# 7. Stories

Thirty-nine stories, COM-01 to COM-39: 21 for the module's first release, of which 6 are gate stories, and 18 later. A gate story must be finished and proved before the stories that rest on it start.

Every story is done only when its named tests in part 8 pass, its strings have British English translations, and `bun run check` is clean.

## What the first release is, and why mailings wait

Cloudflare's email service allows transactional email only, and the platform stays on Cloudflare alone (Matt, 16 November 2026; question 11 in part 9). The first release therefore ships lists, consent, sign-up, unsubscribing, notices and the export. A theatre writes its newsletters in whatever tool it already uses, from an export of its subscribers (COM-26). The campaign engine is built in the first release because a notice runs on it: the editor, the test send, the snapshot and hand-over, and the results. Every story that concerns only a mailing is in "Later", and returns when a later release adds a sender that permits marketing email or Cloudflare changes its rule. Nothing in the data model has to change for that.

**What a theatre must do by hand meanwhile.** An unsubscribe made in the outside tool does not come back by itself. The export therefore carries each person's manage link, so the outside tool's footer can point at this system's manage page and the list here stays the one true record. Before each outside send the theatre exports afresh.

## Where this sits in the order of work

Communications is a second-round module, after roadmap phase 3. It rests on core's notifications (C-27 to C-32), identity's preferences and `verifiedAddressesOf`, the console shell, and requests N1 to N4. It creates no accounts. Notices to ticket holders (COM-20, COM-21) also need box office's audience sources (N7). Nothing in the first three phases waits on this module.

## First release: lists and consent

| Id | As | I want | Done when | Gate | Rests on |
| --- | --- | --- | --- | --- | --- |
| COM-01 | a marketing lead | to create a mailing list on one side with a join mode | The list exists with a key, name, description, side and basis; side and basis lock after the first subscriber; archiving stops sign-up and new mailings | Yes | Console shell |
| COM-02 | a marketing lead | to publish the consent wording for a list | A new version is a new row; the newest is shown; older versions stay readable; a consent list with no wording cannot take sign-ups | Yes | COM-01 |
| COM-03 | a visitor | to join a list from the website with my email address | The sign-up component makes a pending subscription for the address without creating an account, sends a confirmation, and answers identically for a known and an unknown address | Yes | COM-02, N6 |
| COM-04 | a visitor | to confirm by following the link | The subscription becomes subscribed; an expired link offers a fresh one; an unconfirmed subscription is removed after the window |  | COM-03 |
| COM-05 | the theatre | every change to a subscription to leave evidence | Each move writes a consent record with source and wording in the same batch; the table refuses update and delete except erasure | Yes | COM-01 |
| COM-06 | a signed-in person | to see and change my lists in My account | The preferences page of each side shows only that side's lists; joining needs no email; lists joined signed out with any of my verified addresses are shown and can be left; an audience-only account never sees members' lists |  | COM-05, N5 |
| COM-07 | a subscriber | to leave from my manage link without signing in | The manage page unsubscribes on a button press, never on a GET; the link is a signed token in the confirmation message and in the export, good for two years; the page can also email a preferences link, a random token that works once for 24 hours, for seeing other lists or rejoining; a wrong, used or expired link of either kind gets one answer |  | COM-05 |
| COM-09 | a subscriber | to stop every mailing at once | "Stop all" switches the side's topic off in core; no mailing on that side reaches me; switching it back restores my lists |  | COM-07 |
| COM-10 | a marketing lead | to add or remove one person by hand | Adding to an open audience list requires a statement; removing is always allowed; staff cannot re-subscribe someone who left an audience list |  | COM-05 |
| COM-11 | a marketing lead | to see who is on a list | The subscribers page shows names by state and source; each load writes a read audit entry; without the ability only counts show |  | COM-05 |

## First release: the campaign engine, for notices

| Id | As | I want | Done when | Gate | Rests on |
| --- | --- | --- | --- | --- | --- |
| COM-12 | a member of staff | to write a notice and see exactly what will be sent | The editor saves a draft with subject, preheader and markdown body with the blocks a notice allows; the preview is the same renderer core uses, in email, plain text, light and dark |  | N1 |
| COM-13 | a member of staff | to send myself a test | A transactional message marked "Test" reaches only me |  | COM-12 |
| COM-15 | a member of staff | to send now or at a set time | The campaign snapshots its recipients and hands them to core in tranches, each as one set, on the prompt lane, and no person gets it twice even when a job repeats. The bulk lane and the throttle are proved later, with mailings | Yes | COM-12, N2 |
| COM-17 | a member of staff | to see how a notice went | The results tab shows handed over, sent, bounced, failed and excluded by reason; final counts survive core's log retention |  | COM-15, N4 |

## First release: notices

| Id | As | I want | Done when | Gate | Rests on |
| --- | --- | --- | --- | --- | --- |
| COM-19 | another module | to offer a way of choosing people | `communications.audience-source` accepts a contributor; the sources this module declares itself work; a source whose module is off shows as unavailable and blocks sending | Yes | COM-15 |
| COM-20 | a box office manager | to tell everyone holding a ticket for a performance something they need to know | A notice goes to that source on the prompt lane as a transactional message, reaches guests with unclaimed accounts, records a reason, and refuses promotional blocks |  | COM-19, N7 |
| COM-21 | a duty manager | to start a notice from the performance I am looking at | The Messages tab lists notices about the record and opens New notice with the audience filled in |  | COM-20 |

## First release: housekeeping

| Id | As | I want | Done when | Gate | Rests on |
| --- | --- | --- | --- | --- | --- |
| COM-22 | a person | my subscriptions to follow identity's erasure, merge and download | Erasure deletes subscriptions and clears the account from records and recipients; on a merge the module's handler step first settles each list both accounts are on, keeping the stricter state, never reviving an unsubscribe and setting the other row aside, and the move then re-points the rest to the survivor; an undone merge returns the set-aside rows and leaves every unsubscribe standing on both accounts; the download includes subscriptions and consent history, found through the account scope |  | COM-05 |
| COM-23 | an administrator | to be told when sending is stuck | Health checks report a stalled campaign, a consent list with no wording and failing confirmations; the sweep re-queues a dead tranche |  | COM-15 |
| COM-24 | an administrator | to switch the module off safely | Its screens, component and checkout entries vanish; scheduled campaigns do not start; data is kept and returns |  | COM-15 |
| COM-26 | a marketing lead | to export a list to the tool our newsletters are written in | A CSV of the subscribed rows and no others, made on the bulk lane and delivered as a record-access file, with a fresh sign-in and a read audit entry. Each row carries the address, the source, the date, the wording version and the person's manage link |  | COM-11 |

## Later

| Id | As | I want | Done when | Rests on |
| --- | --- | --- | --- | --- |
| COM-08 | a subscriber | my mail app's unsubscribe button to work | Every mailing carries the RFC 8058 headers; a POST with the token alone unsubscribes | COM-07, N3 |
| COM-14 | a marketing lead | to see how many people a mailing will reach before I send | The send steps show on the list, cannot be reached, and will receive, as counts | COM-12, N4 |
| COM-16 | a marketing lead | to pause or cancel a mailing that is going out | Pause stops new tranches; cancel excludes everyone not yet handed over and says how many were already sent | COM-15 |
| COM-18 | a marketing lead | to start from a mailing template | Three shipped templates; a theatre can add its own; editing a template never changes a campaign | COM-12 |
| COM-25 | a marketing lead | to import the list we already have | Upload, check, declare and run; an import never reverses an unsubscribe; optional reconfirmation; the file is purged after its retention | COM-10 |
| COM-27 | a ticket buyer | to tick a box at checkout to join a list | Lists offered at checkout appear as tick boxes; consent and the subscription are written in box office's own batch when the order is first confirmed or reserved, once | N7 |
| COM-28 | a form author | to add a consent question that subscribes the respondent | The field type shows the list's current wording; the outcome action subscribes with the wording id | N8 |
| COM-29 | a membership secretary | a list that is always "all current members" | An automatic list resolves from its source at send time; a member can opt out and stays out | COM-19, Membership |
| COM-30 | a theatre that chooses to | to write to recent bookers who were offered an opt-out | The existing-customer basis can be switched on; such a list is automatic, audience-side, and every mailing carries the opt-out | COM-29 |
| COM-31 | a venue manager | a second person to approve each mailing | With the setting on, a mailing waits in review; the author cannot approve; the approver can send it back | COM-15 |
| COM-32 | a marketing lead | to narrow a mailing to some of a list | Include and exclude rows by audience source, with counts at each step | COM-19 |
| COM-33 | a marketing lead | to save a narrowing and reuse it | A named segment that campaigns copy | COM-32 |
| COM-34 | a member | members' mailings in my inbox as well as by email | The member mailing type delivers to the inbox channel when the campaign selects it | COM-15 |
| COM-35 | a marketing lead | to drop a production or its dates into a mailing | Production card and performance list blocks read public data when sending starts; other modules may contribute blocks | COM-12 |
| COM-36 | a marketing lead | to send a correction to those who got a mailing, or the rest to those who did not | The campaign-recipients source selects by an earlier campaign and outcome | COM-19 |
| COM-37 | a subscriber | to read past mailings on the website | A list may publish an archive of its sent mailings, per list and off by default | COM-17 |
| COM-38 | a marketing lead | to know which links were followed, in total | Aggregate counts per link with no per-person record. Opens are never tracked | COM-17 |
| COM-39 | a member of staff | to put a "before you come" panel for a production or performance into a notice or a mailing | A before-you-come block reads core's beforeYouCome(productionId, performanceId?) when sending starts and renders all of it and nothing else: the age guidance, the staging effects, those not used at this performance, and a link to the production page. It never names or counts a content warning, only says that the page has them. It is not promotional, so a notice may carry it. When the read says empty it renders nothing | COM-12, core's content warnings slice |

## If the first release has to shrink

Cut in this order, last first: COM-21, COM-13, COM-17 (keep the counts, drop the screen), COM-10. The gate stories, COM-07, COM-09 and COM-26 are never cut: a list that cannot be left, or cannot be taken to where the newsletters are written, is not shippable.
