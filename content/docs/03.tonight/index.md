---
title: Tonight
description: The phone screens a show night runs on, who they open for, and the hub they all start from.
module: Show night
audience: member
updatedOn: 2026-09-26
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
19:20: the Front of House Manager opens the door and the duty manager's screens, and the Bar
Manager opens the till. Every opening of that kind is recorded and flagged on the night report,
which is how the committee sees a rota that is not being kept.
::

## If something goes wrong

- **"This needs a confirmed door shift on one of tonight's performances, or the front of house
  manager's role"** (or the same for a bar shift and the Bar Manager, or for a duty manager
  shift): nothing tonight gives you this screen. Find the person named, or ask the officer to assign you the shift on
  the rota. The IT Manager is never offered as the answer to a rota that is wrong.
- **"Nothing is running tonight, so there is nothing to take charge of"**: no performance at
  any venue tonight, or the only one is cancelled. Check the programme.
- **"Show-night tools open for tonight only, and that night has ended"**: the screen was open
  past 04:00. Go back to the hub and open it again.
- **"More than one venue is running tonight: name the venue or the performance"**: two venues
  are running and nothing narrowed the request. The hub passes the chosen performance to the
  screens that take one; the till does not yet carry a picker and cannot be opened on such a
  night from the phone.
- **"Showing what was last loaded: …"**: the connection dropped. The figures on screen are the
  last ones fetched, and the Last synced line says when.

## Who opens what

| Screen | A shift of | Or the role |
| --- | --- | --- |
| The door | Door | Front of house manager |
| Tonight at a glance, Checklist, Night report, Backstage, house numbers on the hub | Duty manager | Front of house manager |
| The till | Bar | Bar manager |
| Contacts and incidents, Challenge 25, Emergency | Any of the three | Either |

A door shift does not open the till, and the Front of house manager's role does not either; the
roles are not interchangeable. The show night runs from 04:00 to 04:00, so a performance that
finishes at 01:00 is still tonight, and a screen left open past 04:00 is refused rather than
quietly moved on to the next night.

## The hub

![The hub with the on-shift badge (1), the performance switcher (2), the house numbers (3), the Door tile (4) and the Emergency tile (5)](/images/docs/show-night/hub.png)

1. **The badge** says how you got in: **On shift** with your first name, or **Officer** when a
   role opened the screen with no shift behind it.
2. **The performance switcher** appears only when the venue runs more than one performance
   tonight, a matinee and an evening. The clock picks the house whose doors are open now; a press
   holds your choice until you press another.
3. **The house numbers** are the three words every show-night screen uses for the house:
   **sold** (tickets sold, paid or not) against capacity, **in** (people admitted through the
   door) and **seats left** (capacity less sold, or **No cap** where the house is uncapped).
   They refresh on their own every 20 seconds; a dropped connection leaves the last numbers on
   screen with a warning rather than a spinner, and the **Last synced** line at the top of every
   screen says how old what you are looking at is. The numbers need duty manager authority; a
   door or bar shift sees the tiles without them.
4. **Door** opens [the door](/docs/tonight/door), for tickets and passes alike.
5. **Emergency** opens [the emergency card](/docs/tonight/emergency), which is cached on
   the phone the moment any show-night screen opens.

Every destination of the night is a tile, in the order they are pressed on a night: **Door**,
**Till** (for a bar shift or the Bar manager only), **Tonight at a glance**, **Checklist**,
**Night report**, **Challenge 25**, **Backstage**, **Contacts and incidents**, and **Emergency**
last. The **Checklist** tile says what is left on it: **3 pre-show items left**
before the house opens, **2 post-show items left** after, **All ticked** when nothing is
outstanding. On a matinee day the **Tonight at a glance**, **Checklist**, **Night report** and
**Contacts and incidents** tiles carry the house you chose on the switcher, so each opens on it. The line at the
foot of the hub is the rule the whole night runs on: the door never sells tickets; unpaid and
walk-up customers go to the bar.

From house open (doors, or curtain where no doors time is set) the hub shows a warning naming any
required pre-show checklist item that is still not done.

## The screens

::card-group
  ::card{icon="i-lucide-scan-line" title="Door" to="/docs/tonight/door"}
  Scan or type a reference; PAID, UNPAID or a named refusal; admitting a pass holder.
  ::
  ::card{icon="i-lucide-gauge" title="Tonight at a glance" to="/docs/tonight/tonight-at-a-glance"}
  The numbers, pass pressure, show information, who is on tonight and the backstage code.
  ::
  ::card{icon="i-lucide-store" title="Till" to="/docs/tonight/till"}
  Drinks, ticket money and walk-ups in one basket, on the reader or through the SumUp app.
  ::
  ::card{icon="i-lucide-id-card" title="Challenge 25" to="/docs/tonight/challenge-25"}
  The Challenge 25 register: logging a check, and correcting one.
  ::
  ::card{icon="i-lucide-list-checks" title="Checklist" to="/docs/tonight/checklist"}
  The pre-show and post-show checklist, exceptions, and closing the night.
  ::
  ::card{icon="i-lucide-file-signature" title="Night report" to="/docs/tonight/night-report"}
  Tonight's report as it fills in, the closing note and signing the night off.
  ::
  ::card{icon="i-lucide-phone" title="Contacts and incidents" to="/docs/tonight/contacts-and-incidents"}
  Who is on tonight, the incident log and a one-press near miss.
  ::
  ::card{icon="i-lucide-siren" title="Emergency" to="/docs/tonight/emergency"}
  The address to read to 999, exits, first aid and isolation points, offline.
  ::
  ::card{icon="i-lucide-messages-square" title="Backstage" to="/docs/tonight/backstage"}
  House open, clearance and the calls between front of house and the wings.
  ::
  ::card{icon="i-lucide-moon-star" title="Closing the night" to="/docs/tonight/closing-the-night"}
  Unanswered SumUp hand-offs, closing the till, the post-show checklist and the night report.
  ::
::

## What happens next

An officer opening a screen with no shift writes one audit entry per night, venue and role, and
the night report's staffing section flags it. A shift holder writes nothing extra: the rota's own
claim and confirmation are the record of how they came to hold it. Every admission, sale, check
and incident logged from these screens keys to a performance, never to a day.

## Related pages

- [My rota](/docs/my-nnt/my-rota)
- [Roles and permissions](/docs/getting-started/roles-and-permissions)
- [Shift templates](/docs/rota/shift-templates)
