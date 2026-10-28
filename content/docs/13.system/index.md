---
title: System
description: The console overview, the settings, the audit trail, backups and restore, and how this documentation is kept.
module: Platform
audience: committee
updatedOn: 2026-10-25
updatedBy: Matt Adcock
navigation:
  title: Overview
  icon: i-lucide-settings
---

These screens are where the theatre's rules are set, where every privileged action is
recorded, and where the IT Manager proves the backups restore. They sit under **Manage,
System** in the console, and the console itself opens on an overview at **Manage, Overview**.

## If something goes wrong

- **"Your sign-in has ended"**: the overview was opened without signing in. Sign in and it loads.
- **"You do not have permission to do that"**: you hold no administrative permission, or not
  the one this screen needs. Ask the IT Manager to check your role; a shift alone never opens
  the console.
- **"What is waiting could not be read"**: the counts did not arrive, so the overview says so
  rather than showing nothing waiting. Open another console screen and come back.
- **"The messages that did not arrive could not be read"**, **"Tonight and the set-up still to
  do could not be read"**, or **"Whether a restore drill is due could not be read"**: that part
  of the overview failed to load, so it cannot say whether anything is wrong. Reload the page;
  if it keeps happening, report it with the megaphone button.

## Who reaches the console

The console is reached by anybody holding a standing permission that is administrative rather
than operational. A door, till or duty manager shift opens tonight's screens and never the
console; an officer whose only permissions are those three is shown no **Manage** link at all.
Within the console each screen checks its own permission, so a person who can reach the
overview may still be refused a screen the sidebar does not show them.

- **Settings** are read by the IT Manager and the Theatre Manager, and changed by the IT
  Manager alone.
- **The audit trail** is read by the IT Manager and the President, and the same two record an
  entry on it.
- **Backups** and **Problem reports** are the IT Manager's alone.

Every standing role expires at the end of the committee year, 31 July, so a permission held in
June is gone in August unless the incoming committee grants it again.

## The overview

The overview is what is waiting for you and what is still to be set up. Every part of it is shown
only to somebody who could act on it, so two officers opening it see different screens, and a part
with nothing in it for you is not drawn at all. When no part has anything for you, it says
**Nothing is waiting for you**, with a link to the money dashboard for those who read it.

![The console overview with the help link (1), Waiting for you (2), Tonight (3), Set-up still to do (4) and the messages that did not arrive (5)](/images/docs/system/overview.png)

1. **Help for this screen** opens the documentation page for the screen you are on. Every
   console, member and show-night screen carries one.
2. **Waiting for you** has one line for each queue you decide, with how many are in it now and
   a link to the screen that works it. A queue with nothing in it still has its line, reading 0.
   The numbers are the ones beside each screen in the sidebar, read once for both.
3. **Tonight** lists what is on this show night, 04:00 to 04:00, with the venue and the curtain
   time, and opens tonight's screens. It is for whoever can open those screens without a shift:
   the Front of House Manager and the IT Manager.
4. **Set-up still to do** lists what the theatre has not yet been given, each line opening the
   screen that finishes it. It disappears once everything in it is done.
5. **Messages that did not arrive** lists every send that has not reached a person, newest first,
   with why. It is for whoever reads the audit trail (the President and the IT Manager), and is
   not shown to anybody who does not:
   a trainer or a department lead reaches this screen on their standing alone, and an empty
   card would wrongly tell them nothing had failed.

### Waiting for you

| Line | For | Opens |
| --- | --- | --- |
| Membership claims to record | whoever records claims: the IT Manager | [Members](/docs/people/members), on its claims queue |
| Access declarations to verify | the Secretary and Welfare Officer | [Access declarations](/docs/people/access-declarations) |
| Room requests to decide | the Theatre Manager | [Room requests](/docs/spaces/room-requests) |
| Training requests to answer | the Theatre Manager, and a department lead for their own departments | [Requests](/docs/training/requests) |
| Pass requests to fulfil, for a pass on sale | the Front of House Manager | [Pass desk](/docs/box-office/pass-desk) |
| Rota claims to confirm, a shift's or a bar opening slot's, from tonight on | whoever changes the rota: the Front of House Manager | [Rota](/docs/rota/rota-board), on Waiting for confirmation |

The IT Manager holds every permission, so sees every line.

### The rota this week

Whoever reads the rota also sees **The rota this week**: the next seven nights, from tonight, that
still need somebody. Each line names the night and says how many places are left to fill (an open
or declined shift, or a bar opening's slot) and whether a performance has no confirmed duty
manager, which reads in amber. The night opens on the [rota](/docs/rota/rota-board) at that date.
A week with every place filled and a duty manager confirmed every night shows no card at all.

### Set-up still to do

| Line | For | Opens |
| --- | --- | --- |
| A shift role with no training module named, or one still a draft, retired or missing, so nobody can claim that shift | whoever reads the rota | the readiness card on [Shift templates](/docs/rota/shift-templates) |
| Nothing is on hand at the bar | whoever reads the bar | [Stock](/docs/bar/stock) |
| No stocktake has been applied yet | whoever reads the bar or takes a stocktake | [Stocktakes](/docs/bar/stocktakes) |
| Stocked items with no allergen answer, counting any not retired | whoever reads the bar | [Allergens](/docs/bar/stock#allergens) |
| No incident severity routes to follow-up, so a serious incident reaches nobody | whoever changes the routing: the Theatre Manager and the IT Manager | [Safety](/docs/rota/safety) |

### Setting up the theatre

On a new install the IT Manager sees **Setting up the theatre** at the top of the overview: the
order the screens need each other in, each step opening the screen that does it.

1. Add the venues the theatre performs in ([Venues](/docs/box-office/venues)).
2. Open a season for the programme ([Seasons](/docs/box-office/seasons)).
3. Set the ticket types and their prices ([Ticket types](/docs/box-office/ticket-types)).
4. Add the first show and its performances ([Shows](/docs/box-office/shows)).
5. Grant the rest of the committee their roles ([Roles](/docs/people/roles)).
6. Give a venue the shifts its nights need ([Shift templates](/docs/rota/shift-templates)).
7. Add the bar's products ([Products](/docs/bar/products)).

A step ticks as soon as one of its things exists, and the card goes once every step has ticked.
A role running out at the year end, or a ticket type archived or a product retired, does not bring
it back. Deleting the last of something does: if every shift template is removed, say, the card
returns with that step unticked. Otherwise **Set-up still to do** says what is missing.

### An overdue restore drill

If the last restore drill failed, if none has ever passed, or if the interval between drills has
run out, the IT Manager sees a warning at the top of the overview with a button to
[Backups](/docs/system/backups). It stays there until a drill passes.

### Messages that did not arrive

Each line carries a badge in the send log's own words: **Waiting to go**, **Trying again**,
**Failed, will try again**, **Failed, no attempts left**, **Held back by a preference** or
**Skipped, no address to send to**. Beside the person's name and the message type is the
reason: **muted this topic**, **has not proved their address**, **the account is gone**, **the
account was erased**, or **no reason recorded**. A failure here is a person who was not told
something, so it belongs in front of the committee rather than in a log nobody opens.

If you can read the [send log](/docs/communications/send-log), each name opens that person's send
history, and **Open the send log** under the list opens the whole log.

**Needs you: nights to reconcile** appears only when a night is waiting, and only to somebody who
reads the money records, such as the Treasurer. It lists every night that took card money with no
Z reading recorded, and every night whose reading still disagrees with what we expect, oldest
first and never cut short. Each night links straight to its
[daily reconciliation](/docs/money/daily-reconciliation). The money dashboard carries the same
list.

**Published shows nobody has assessed for content warnings** appears only when there is at least
one, and only to somebody holding a ticketing permission. A published show with no warnings and
no confirmation that there are none says exactly that on its public page, which is honest and
is not the answer anybody wants. Each title links to the show, where the assessment is recorded:
see [Content warnings](/docs/box-office/content-warnings).

## The screens

::card-group
  ::card{icon="i-lucide-sliders-horizontal" title="Settings" to="/docs/system/settings"}
  Every operational number the theatre works to, changed by a decision rather than by a release.
  ::
  ::card{icon="i-lucide-scroll-text" title="Audit trail" to="/docs/system/audit-trail"}
  Every privileged action, searchable and exportable, with signed entries for what happened away from a screen.
  ::
  ::card{icon="i-lucide-database-backup" title="Backups" to="/docs/system/backups"}
  What is backed up, how a restore works, and the drill that proves it.
  ::
  ::card{icon="i-lucide-megaphone" title="Reporting a problem or an idea" to="/docs/system/reporting-a-problem-or-an-idea"}
  The megaphone button on every console and show-night screen, and what happens to a report.
  ::
::

## Related pages

- [Roles and permissions](/docs/getting-started/roles-and-permissions)
- [Finding your way](/docs/getting-started/finding-your-way)
- [Send log](/docs/communications/send-log)
