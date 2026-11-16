# 1. Scope and glossary

The module covers mailing lists, the consent behind them, and messages a member of staff writes and sends to many people. It builds on core's notifications, topics and suppression and adds no second route for sending.

Cloudflare's email service carries transactional email only, and the platform stays on Cloudflare alone. So the first release builds lists, consent, sign-up, unsubscribing, notices and the export; mailings to a list are specified here and built later. The "In scope" table says which is which.

## The module

| Module | Id | Requires | Uses | Can be switched off | Owns |
| --- | --- | --- | --- | --- | --- |
| Communications | `communications` | `core` | `box-office`, `forms`, `membership`, `front-of-house` | Yes | The nine tables in part 2 |

Every `uses` link is soft. With all four off, the module still runs: lists, sign-up, consent, the export and notices to this module's own audience sources need only core.

## In scope

| Area | What it gives | Release |
| --- | --- | --- |
| Lists | Named mailing lists on the audience side or the members' side, with a join mode and a consent basis | First |
| Subscriptions | Joining and leaving a list: public sign-up, at checkout, from My account, by staff in the first release; by a form and by import later | First, in part |
| Consent | The wording shown, versioned; an append-only record of every grant and withdrawal; double opt-in | First |
| Notices | A plain operational message to people chosen by an audience source, with no subscription needed: compose in markdown, preview, test, send at once or at a set time | First |
| Sending | Snapshot of recipients, tranches handed to core as sets, results. For a mailing, later: the bulk lane, throttle, pause and cancel part-way | First for notices |
| Hygiene | Reachability counts from core, leaving by the manage link, and the export of subscribers with their consent evidence. Import comes later | First, in part |
| Mailings | A message to a list narrowed by audience sources, with blocks, a schedule and the mail client's own unsubscribe button | Later |
| Mailing templates | Reusable starting content in the theatre's branding | Later |

## Out of scope, and who has it

| Not here | Where it is |
| --- | --- |
| Sending an email, retrying, the delivery log, bounces | Core's notification pipeline |
| The suppression list | Core (`core_email_suppressions`). This module reads the answer through a service and never keeps a copy |
| Per-topic preferences and digests | Core's preferences screen. This module adds its lists to that screen |
| Receipts, tickets, sign-in links and every other automatic message | The module that owns the event. They are notification types, not mailings |
| The message to ticket holders when a performance is cancelled or moved | Box office, automatically. A notice is for what staff choose to say by hand |
| Who holds a ticket, who is a member, who is on a rota | Box office, Membership, Front of house, each contributing sources to `communications.audience-source`. The sources that read core and identity (a production's team, role holders, ability holders, members) are this module's own |
| Building a sign-up form with extra questions | Form builder. This module supplies a consent question type and a subscribe action |
| Donor and sponsor appeals as a workflow | Fundraising, later. It would send through this module |
| Text messages, push, post | Later, as core notification channels. Nothing here assumes email beyond the first release |
| Open and click tracking | Opens are never tracked. Clicks may be counted in aggregate, never per person, in a later release |
| Inbound mail and shared mailboxes | Not this platform. Mailflare does that job |

## Principles

1. **One pipeline.** A campaign is a set of core notifications. Anything core refuses to send, this module cannot send.
2. **Opt in, provably.** Nobody is on a consent-based list without a consent record that names the wording they saw.
3. **Leaving is easier than joining.** One click, no sign-in, effective before the next tranche is handed over.
4. **A side is never crossed.** A list has one side, fixed at creation. A mailing writes to the address the person chose for that side.
5. **Staff see counts before people.** Screens show how many, and only an ability with read auditing shows who.
6. **Marketing cannot pass as service.** A notice has its own ability, a stated reason, and no blocks that sell.
7. **Nothing about a person leaves in an event.** Subscription and consent events are internal.

## Glossary

Words this module owns. "Template" and "draft" are qualified, as the shared glossary rules.

| Word | Meaning |
| --- | --- |
| list | A named mailing list on one side. Always "mailing list" where "list" alone could mean a List page |
| join mode | How people get onto a list: open, staff-only or automatic |
| automatic list | A list whose members are worked out from an audience source at send time. People cannot join it but can opt out |
| consent basis | Why the theatre may write to people on a list: consent, existing customer or membership |
| consent wording | The exact sentence shown beside the tick box, versioned |
| consent record | One append-only row for one grant or withdrawal |
| subscription | One person's current state on one list: pending, subscribed or unsubscribed |
| double opt-in | A subscription stays pending until the person follows a link sent to the address |
| mailing | A message written by staff and sent to a list. Needs a subscription. Built in a later release |
| notice | A message written by staff and sent to an audience source. Needs no subscription and cannot be muted |
| campaign | The record behind either: its content, audience, schedule and results. "Mailing" and "notice" are its two kinds |
| audience source | A way of choosing people, declared by this module or contributed by another: "ticket holders for a performance" |
| narrowing | Audience sources applied to a mailing's list: include only, or exclude |
| recipient | One person in a campaign's snapshot |
| snapshot | The fixed set of recipients taken when sending starts |
| tranche | The recipients one job hands to core in one unit of work |
| mailing template | Reusable starting content for a campaign. Never "template" alone |
| block | A named piece of content in a body: a button, a production card, a list of performances |
| reachable | Core says an email can be sent to this person on this side: a verified address that is not suppressed |
| manage link | The per-subscription link that lets a person leave a list, or stop all, without sign-in. A signed token that holds the subscription id and an expiry. It is in the confirmation message, in each row of the export and, later, in the footer of every mailing |
| preferences link | A link emailed on request that opens a signed-out person's lists on one side, to join, leave or rejoin. A random token that works once, for 24 hours |

Words used here that others own: topic, notification type, delivery, suppression, sender identity, transactional (core); side, account, unclaimed account (identity); lane, job, task, point, fact, internal event (foundations); form slot, outcome action (form builder).
