---
title: Tonight
description: The phone screens a show night runs on, who they open for, and the hub they all start from.
module: Show night
updatedOn: 2026-09-15
updatedBy: Matt Adcock
navigation:
  title: Overview
  icon: i-lucide-moon-star
---

The show-night screens live at `/tonight` and are built for a phone held in one hand in a
foyer: a dark screen, big buttons, the actions under your thumb, no sidebar. The hub is the
navigation; every other screen has a back arrow to it. On a night you hold a confirmed shift,
**Tonight** appears in the account menu and the **Next shift** tile on My NNT points here; the
address also works typed into any phone.

::callout{icon="i-lucide-info" color="info"}
**A shift tonight is what opens these screens, not a standing role.** A confirmed door, bar or
duty manager shift on one of tonight's performances is the ordinary way in, and it stops working
at 04:00 with nothing to revoke. Two roles open the screens anyway when the rota is wrong at
19:20: the Front of house manager opens the door and the duty manager's screens, and the Bar
manager opens the till. Every such opening is recorded and flagged on the night report, so the
committee can see when the rota is not being kept (0044).
::

## Who opens what

| Screen | A shift of | Or the role |
| --- | --- | --- |
| The door, Admit pass holder | Door | Front of house manager |
| Tonight at a glance, Checklist, Backstage, house numbers on the hub | Duty manager | Front of house manager |
| The till | Bar | Bar manager |
| Contacts and incidents, Challenge 25, Emergency | Any of the three | Either |

A door shift does not open the till, and the Front of house manager's role does not either; the
roles are not interchangeable. The show night runs from 04:00 to 04:00, so a performance that
finishes at 01:00 is still tonight, and a screen left open past 04:00 is refused rather than
quietly moved on to the next night.

## The hub

![The hub with the on-shift badge (1), the performance switcher (2), the house numbers (3), the Scan ticket tile (4), the Admit pass holder tile (5) and the Emergency tile (6)](/images/docs/show-night/hub.png)

1. **The badge** says how you got in: **On shift** with your first name, or **Officer** when a
   role opened the screen with no shift behind it.
2. **The performance switcher** appears only when the venue runs more than one performance
   tonight, a matinee and an evening. The clock picks the house whose doors are open now; a tap
   holds your choice until you tap another.
3. **The house numbers** show reserved seats against capacity, seats collected (through the
   door), and walk-up headroom. They refresh on their own every 20 seconds; a dropped connection
   leaves the last numbers on screen with a warning rather than a spinner, and the **Last
   synced** line at the top of every screen says how old what you are looking at is. The numbers
   need duty manager authority; a door or bar shift sees the tiles without them.
4. **Scan ticket** opens [the door](/docs/show-night/the-door).
5. **Admit pass holder** opens the door in pass mode.
6. **Emergency** opens [the emergency card](/docs/show-night/emergency-card), which is cached on
   the phone the moment any show-night screen opens.

The other tiles are **Tonight at a glance**, **Backstage**, **Contacts and incidents** and, for
a bar shift or the Bar manager only, **Till**. The line at the foot of the hub is the rule the
whole night runs on: the door never sells tickets; unpaid and walk-up customers go to the bar.

From house open (doors, or curtain where no doors time is set) the hub shows a warning naming any
required pre-show checklist item that is still not done.

## The screens

::card-group
  ::card{icon="i-lucide-scan-line" title="The door" to="/docs/show-night/the-door"}
  Scan or type a reference; PAID, UNPAID or a named refusal; admitting a pass holder.
  ::
  ::card{icon="i-lucide-gauge" title="At a glance" to="/docs/show-night/at-a-glance"}
  The numbers, pass pressure, show information, who is on tonight and the backstage code.
  ::
  ::card{icon="i-lucide-store" title="The till" to="/docs/show-night/the-till"}
  Drinks, ticket money and walk-ups in one basket, on the reader or through the SumUp app.
  ::
  ::card{icon="i-lucide-id-card" title="Age checks" to="/docs/show-night/age-checks"}
  The Challenge 25 register: logging a check, and correcting one.
  ::
  ::card{icon="i-lucide-list-checks" title="Checklists" to="/docs/show-night/checklists"}
  The pre-show and post-show checklist, exceptions, and closing the night.
  ::
  ::card{icon="i-lucide-phone" title="Incidents" to="/docs/show-night/incidents"}
  Who is on tonight, the incident log and a one-tap near miss.
  ::
  ::card{icon="i-lucide-siren" title="Emergency card" to="/docs/show-night/emergency-card"}
  The address to read to 999, exits, first aid and isolation points, offline.
  ::
  ::card{icon="i-lucide-messages-square" title="Backstage board" to="/docs/show-night/backstage-board"}
  House open, clearance and the calls between front of house and the wings.
  ::
  ::card{icon="i-lucide-moon-star" title="Closing the night" to="/docs/show-night/closing-the-night"}
  Unanswered SumUp hand-offs, closing the till, the post-show checklist and the night report.
  ::
::

## If something goes wrong

- **"This needs a confirmed door shift on one of tonight's performances, or the front of house
  manager's role"** (or the same for a bar shift and the bar manager, or a duty manager shift):
  nothing tonight gives you this screen. Find the person named, or ask the officer to assign you the shift on
  the rota. An administrator is never the answer offered, on purpose.
- **"Nothing is running tonight, so there is nothing to take charge of"**: no performance at
  any venue tonight, or the only one is cancelled. Check the programme.
- **"Show-night tools open for tonight only, and that night has ended"**: the screen was open
  past 04:00. Go back to the hub and open it again.
- **"More than one venue is running tonight: name the venue or the performance"**: two venues
  are running and nothing narrowed the request. The hub passes the chosen performance to the
  screens that take one; a screen that does not yet carry a picker cannot be opened on such a
  night from the phone.
- **"Showing what was last loaded: …"**: the connection dropped. The figures on screen are the
  last ones fetched, and the Last synced line says when.

## What happens next

An officer opening a screen with no shift writes one audit entry per night, venue and role, and
the night report's staffing section flags it. A shift holder writes nothing extra: the rota's own
claim and confirmation are the record of how they came to hold it. Every admission, sale, check
and incident logged from these screens keys to a performance, never to a day.

## Related pages

- [Your rota](/docs/members/your-rota)
- [Roles and permissions](/docs/getting-started/roles-and-permissions)
- [Shift templates](/docs/rota/shift-templates)
