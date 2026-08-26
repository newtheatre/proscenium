# Module H: Communications

One notification centre replaces the four apps' divergent email habits: rehearsal's disciplined
ledger and digests, rooms' half-built push and preference toggles, proscenium's ad-hoc transactional
sends, and stage-door's warning trails. Every automated message flows through one pipeline with
per-topic preferences, a send log, retries and undeliverable-address protection; marketing is a V2
capability built consent-first and structurally separated from operational messaging.

Stories: 14 total (9 MVP, 4 V2, 1 Later).

## Open questions

1. Which roles may use admin fan-out, and to which audiences? Does a whole-membership announcement
   need a second officer's approval, or is the audit trail enough?
2. Is one hour the right default digest window for every topic, or do shifts and room bookings
   (where a same-day change is urgent) need a shorter window or an exemption?
3. What is the retention period for the send log? rehearsal prunes its notification ledger at 24
   months; the unified log also feeds GDPR export (messages metadata), so the period needs a
   decision and a documented owner.
4. Do PECR soft opt-in rules let the theatre email past bookers about similar shows without the
   explicit marketing opt-in, and does the committee want to rely on that or require the opt-in
   regardless (the stricter reading is assumed below)?
5. Push scope for V2: web push only, or is there appetite for anything further (the Later stub
   assumes SMS is investigated only after push has proven itself)?

## H-101: One notification centre for every automated message

- Role: Audience account
- Phase: MVP
- Story: As anyone with an account, I want every automated message the theatre sends me to flow through one notification centre so that what I receive is consistent, logged and controllable in one place.
- Depends on: A-1
- Acceptance criteria:
  1. Every module sends through the notification centre's enqueue API; a CI check fails the build if any code outside the centre's sender calls the mail provider directly.
  2. Every message carries a type from a registered catalogue (topic, transactional flag, template reference); enqueueing an unregistered type is refused with an error, never sent untyped.
  3. Channels at MVP are email and in-app inbox; web push exists in the channel model and the consent schema from day one but has no deliverer until H-204, and a message routed to push before then is logged as undelivered-channel, never silently dropped.
  4. No email is sent to an unverified address, except the verification message itself and its resends.
  5. Email resolves the recipient's current address at send time, not at enqueue time, so an address change between the two reaches the new address.
  6. Push consent is recorded per account and device with timestamp and source; the legacy rooms push subscriptions are not migrated, and consent is re-collected when push actually delivers.
- Source: Prompt Book H-1, module 0 P5/P6; audit RM-6 (push recorded, never delivered), PR-15 (reminder email written, never wired), Get-In part 2 (rooms push: retire).

## H-102: Per-topic notification preferences

- Role: Member
- Phase: MVP
- Story: As a member, I want notification preferences per topic rather than per module so that I choose what I hear about, not which app happens to send it.
- Depends on: H-101
- Acceptance criteria:
  1. The topics are exactly: bookings, shifts, training, room bookings, committee announcements; the preference screen is one page showing a topic-by-channel matrix with the current value of every cell.
  2. Preferences are stored per topic per channel; defaults for a new account are agreed in Phase 0 configuration and are visible on the screen as defaults.
  3. A message whose topic is switched off for a channel is recorded in the send log as suppressed-by-preference for that channel, and is not handed to the provider.
  4. A preference change takes effect for the next send; no queued digest already cut is recalled.
  5. Suppression never applies to types flagged transactional (H-103); the preference screen states this next to each topic.
  6. In-app inbox entries are always written regardless of email preference, so switching email off never makes a message unfindable.
- Source: Prompt Book H-1 (preferences per topic, not per module); audit RM-1/RM-6 (rooms admins can switch email off entirely, leaving a log line as backstop).

## H-103: Transactional messages always deliver

- Role: Audience account
- Phase: MVP
- Story: As a booker, I want tickets, receipts and safety notices to arrive regardless of my preferences so that opting out of chatter never costs me something I need.
- Depends on: H-101
- Acceptance criteria:
  1. The transactional flag lives on the message type in the catalogue, never at the call site; a reviewer can list every transactional type in one query.
  2. Ticket issue and re-issue, payment and refund records, booking changes made by staff, security emails (verification, password reset, MFA changes) and safety notices are flagged transactional.
  3. A test account with every preference switched off still receives its e-ticket and its refund confirmation by email.
  4. Transactional types have no preference rows at all, so no API path can suppress one; attempting to set a preference on a transactional type returns a validation error.
  5. Transactional messages are never held for digest coalescing (H-104): each sends immediately and individually.
- Source: Prompt Book H-1 (transactional always delivers); audit TR-9 (rehearsal sends confirmations and promotions regardless of digest dry-run mode, because each answers something a person just did).

## H-104: Digest coalescing

- Role: Member
- Phase: MVP
- Story: As a member, I want rapid-fire changes coalesced into one message so that five edits to my bookings in an hour is one email, not five.
- Depends on: H-101, H-102
- Acceptance criteria:
  1. Non-transactional messages of the same topic to the same person within the digest window coalesce into a single email listing every change individually; five room-booking status changes inside the window produce exactly one email with five entries.
  2. The window is configurable per topic through the settings surface (J-3), defaulting to 60 minutes; the window opens at the first held message.
  3. A transactional message never joins a digest and never delays one.
  4. The in-app inbox always shows the individual entries; only the email is coalesced.
  5. Each coalesced email is one row in the send log referencing its constituent entries, so "was I told about X" remains answerable per change.
  6. An automated test enqueues five changes inside the window and asserts one provider call; a sixth after the window closes produces a second email.
- Source: Prompt Book H-1 (digest coalescing); audit RM-4 (status-change emails group per user: five moved bookings, one email), SD-13, TR-9 (grouped warnings and digests).

## H-105: The send log, with retries

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want every automated send logged with type, recipient and outcome, and failures retried, so that a lost message is a queryable fact rather than a mystery.
- Depends on: H-101
- Acceptance criteria:
  1. Every send attempt writes a log row: message type, topic, recipient, channel, template version, enqueue and send timestamps, and outcome (delivered-to-provider, failed, suppressed-by-preference, skipped-undeliverable, undelivered-channel).
  2. A failed send retries automatically with backoff, a configurable maximum number of attempts, and each attempt appended to the same log entry; exhausted retries mark the entry failed-final and surface it on the operations dashboard (H-106).
  3. The log is append-only; nothing edits an outcome except the retry machinery appending to its own entry.
  4. GDPR export includes the person's send-log metadata; erasure anonymises the recipient reference on historical rows and the statistics survive, matching the estate-wide erasure rule.
  5. Log rows past the configured retention period are pruned by a scheduled sweep, and the period is documented in the data model.
  6. A named regression test kills the provider mid-send and asserts the entry ends failed, retries, and is never lost or duplicated.
- Source: Prompt Book H-1 (every automated send logged; failed sends retry); audit TR-9 (notification ledger holds idempotency evidence, pruned at 24 months), PR-10 (unsent night-report emails retried by cron).

## H-106: The operations view of what was sent

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want a dashboard of what the system sent and what failed so that "did the reminder go out" is a lookup, not an investigation.
- Depends on: H-105
- Acceptance criteria:
  1. The dashboard lists recent sends filterable by type, topic, channel, outcome and date range, paged in SQL with a pagination envelope.
  2. Failed-final entries form a queue with a manual re-send action; a re-send is a new audited log entry referencing the failed one, never an edit of it.
  3. An authorised operator can view one person's send history (types, dates, outcomes; never message bodies containing another person's data) to answer support queries.
  4. Daily counts by type and outcome are visible, so a silent provider outage shows as a visible dip rather than nothing.
  5. Access requires the communications-operations permission and every view of a person's history is audited.
- Source: Prompt Book H-1 (failures surface on an operations dashboard rather than vanishing); audit RM-6 (a request can sit pending with only a log line as backstop).

## H-107: Undeliverable-address protection

- Role: System
- Phase: MVP
- Story: As the theatre, I want anonymised and placeholder addresses structurally excluded from sending so that the mail provider never receives an address that was never real or no longer belongs to anyone.
- Depends on: H-101, H-105
- Acceptance criteria:
  1. Addresses on undeliverable domains (.invalid, .test, example.com and the documented list) and addresses matching the estate's anonymised-placeholder pattern are never handed to the mail provider; the attempt is logged as skipped-undeliverable.
  2. Anonymised accounts are excluded from recipient resolution at the query layer, so a fan-out (H-108) or campaign (H-203) cannot enumerate them even by a coding mistake in the caller.
  3. The exclusion rule lives in one place (the centre's recipient resolver), covered by a test that seeds a placeholder address and asserts zero provider calls across a fan-out, a digest and a transactional send.
  4. An account anonymised while a message sits queued has that message dropped and logged as skipped-undeliverable, never sent to the placeholder.
  5. Migration verification: after the proscenium import, a query for send-eligible recipients returns no merged-*@placeholder.invalid or tombstoned rows.
- Source: Prompt Book H-1; audit SD-1 (undeliverable domains silently ignored), EW-2 (anonymised tombstones), Get-In part 3 (merged-*@placeholder.invalid rows live in proscenium's customer table).

## H-108: Admin fan-out with blind copy

- Role: Committee
- Phase: MVP
- Story: As a committee officer, I want to send an announcement to a defined audience without ever disclosing the recipient list so that one message reaches everyone it should and exposes no one.
- Depends on: H-101, H-102, H-105
- Acceptance criteria:
  1. An authorised officer composes to a defined audience (all current members, holders of a role, tonight's rota, a session's sign-ups); the audience is resolved to individuals at send time from live data, not from a pasted list.
  2. Delivery is one message per recipient (or blind copy where batched); no recipient can see any other recipient's address in any header or body, asserted by a test on the rendered provider payload.
  3. Announcements carry the committee-announcements topic and honour preferences; a safety notice may be flagged transactional at the type level, and doing so is visible in the composer.
  4. The composer shows a resolved recipient count and a preview before sending; sending records an audit entry with sender, audience definition and count, and per-recipient outcomes land in the send log.
  5. Recipient resolution passes through the undeliverable-address protection (H-107).
  6. Members with email off for announcements still receive the in-app inbox entry.
- Source: Prompt Book H-1; audit RM-1 (all admins emailed each request, subject to preferences), PR-10 (night reports emailed to configured recipients).

## H-109: Templates and Europe/London formatting

- Role: System
- Phase: MVP
- Story: As the theatre, I want every message rendered from versioned templates with London-pinned dates so that messages look like one organisation and never state a wrong time for half the year.
- Depends on: H-101
- Acceptance criteria:
  1. Every message renders from a versioned template with the shared layout, sender identity and footer (preferences link; unsubscribe link on marketing messages once H-201 exists); the template version used is recorded in the send log.
  2. Every date and time in every rendered message is formatted with Europe/London explicitly pinned; a DST-boundary regression test renders a 19:00 session on the clocks-change weekend and asserts the message says 19:00.
  3. Every email carries a plain-text part alongside HTML.
  4. Templates are previewable with sample data before a change ships, and copy is British English.
  5. Rendering a template against a payload missing a required field fails at enqueue with an error, never sends a message with a blank in it.
- Source: Prompt Book K-1 (Europe/London, DST as test cases); Get-In part 5 (Europe/London pinned); audit SD-4 defect (reset emails always say "valid for one hour", including 24-hour tokens: the class of bug template validation exists to catch).

## H-201: Marketing consent, collected at booking and revocable in one click

- Role: Audience account
- Phase: V2
- Story: As a booker, I want marketing to be its own opt-in that I can revoke in one click so that hearing about shows is my choice, made and unmade without friction.
- Depends on: H-101, D-2
- Acceptance criteria:
  1. Marketing consent is a separate, unticked-by-default opt-in offered at booking and in account settings; it is never bundled with terms acceptance or inferred from a purchase, and it stores timestamp and source.
  2. Every marketing message carries a one-click unsubscribe link that works without signing in and a List-Unsubscribe header; revocation takes effect immediately and is confirmed on a plain page, not by another email.
  3. Consent state and its history are visible to the person in their account.
  4. Erasure deletes the consent record and marketing history outright (consent-based data is deleted, not anonymised), matching the estate erasure rule.
  5. Consent is stored in the structure the marketing query layer joins on (H-202), so a revoked or absent consent makes the person invisible to marketing tooling rather than merely filtered by convention.
- Source: Prompt Book H-2 (consent is its own opt-in, one-click revocable, deleted on erasure); audit EW-2 (consent-based data deleted outright in proscenium).

## H-202: Segments from real data

- Role: Committee
- Phase: V2
- Story: As the publicity officer, I want audience segments built from real attendance and booking data so that "people who saw the last musical" is a click, not an export.
- Depends on: H-201
- Acceptance criteria:
  1. Saved segment definitions cover at least: attended a given show or genre, lapsed bookers (no booking in a configurable period), current pass holders, and first-time bookers in a date range.
  2. Segment membership is evaluated at use time, never stored as a snapshot list of addresses.
  3. The segment query layer selects only from marketing-consented, non-anonymised accounts by construction: the consent join sits in the base query every segment extends, so no definition can reach a non-consented person, and a test proves a segment written without any filter still returns only consented rows.
  4. The composer shows a segment's current count; it never renders the member addresses to the officer.
  5. Creating, editing and using a segment are audited.
- Source: Prompt Book H-2 (segments from real data; hard separation, structural rather than procedural); audit PR-7 (season stats exist to draw from).

## H-203: Campaigns with scheduling and performance

- Role: Committee
- Phase: V2
- Story: As the publicity officer, I want to schedule a campaign to a segment and see how it performed so that publicity runs on evidence inside the system.
- Depends on: H-201, H-202, H-105, H-109
- Acceptance criteria:
  1. A campaign is composed from a template against a segment, with a preview and a test-send to the officer's own address before scheduling.
  2. Scheduling is for a future Europe/London time; a scheduled campaign is cancellable until it starts sending.
  3. The segment re-resolves at send time, so consent revoked between scheduling and sending excludes the person; every send passes through the send log and the undeliverable-address protection.
  4. Per-campaign performance reports resolved recipients, delivered, failed and unsubscribes attributed to the campaign; figures come from the send log, not a parallel store.
  5. Campaign sends are rate-limited to the provider's documented limits so a full-list campaign cannot starve transactional sending; transactional messages always queue ahead of campaign messages.
- Source: Prompt Book H-2 (campaigns with scheduling, previews and per-campaign performance); audit TR-9 (send-window discipline), H-105 above for the log it reads.

## H-204: Web push delivery

- Role: Member
- Phase: V2
- Story: As a member, I want push notifications on my phone for the topics I choose so that a shift reminder or a room change reaches me without opening email.
- Depends on: H-101, H-105
- Acceptance criteria:
  1. The push channel delivers via standard Web Push (VAPID); subscription is per device, prompted only from the notification settings screen, never on first page load.
  2. Push honours exactly the same per-topic preference matrix as email (H-102); no message type is push-only.
  3. Every push send lands in the send log like any other channel; an expired or rejected subscription is marked dead, stops receiving, and the person sees which devices are subscribed and can remove one.
  4. Legacy rooms subscriptions are never imported; the channel launches with zero subscribers and consent collected fresh (Get-In: retire).
  5. A member on push-only for a topic whose subscription has died is detectable on the operations dashboard, so preference plus dead device does not become silence nobody notices.
- Source: Prompt Book H-1 (push as a channel); audit RM-6 (subscriptions stored, sender a logged no-op, member on PUSH receives nothing); Get-In part 2 (push consent re-collected when push actually works).

## H-301: Further channels (SMS for show-night-critical notices)

- Role: Committee
- Phase: Later
- Story: As the committee, I want an assessed option for SMS on show-night-critical notices so that a cancelled performance can reach ticket holders who read neither email nor push in time.
- Depends on: H-204
- Acceptance criteria:
  1. A written assessment (cost per message, provider, consent and PECR position) goes to the committee before any build; no SMS code exists before that decision.
  2. If adopted, SMS is restricted to a small allow-list of transactional show-night-critical types and reuses the existing channel model, send log and undeliverable protection.
  3. Phone numbers are collected with their own stated purpose and deleted on erasure.
- Source: Prompt Book H-1 (channel model designed to extend); Get-In part 6 (decisions before code).
