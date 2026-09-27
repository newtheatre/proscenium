---
title: Tonight
description: The phone screens a show night runs on, who they open for, and the hub they all start from.
module: Show night
audience: member
updatedOn: 2026-09-27
updatedBy: Matt Adcock
navigation:
  title: Overview
  icon: i-lucide-moon-star
---

The show-night screens live at `/tonight` and are built for a phone held in one hand in a
foyer: a dark screen, big buttons, the actions under your thumb, no sidebar. The hub is the
navigation; every other screen has a back arrow to it. While you are on shift (a confirmed shift
inside its own hours), **Tonight** is the first entry in the account menu, a bar under the header
of every public and member page says **You are on shift tonight** with **Open Tonight**, signing
in lands here, and the **Next shift** tile on My NNT points here. The Front of House Manager, the
Bar Manager and the IT Manager see the menu entry all night without the bar. The address also
works typed into any phone.

::callout{icon="i-lucide-info" color="info"}
**A shift tonight is what opens these screens, not a standing role.** A confirmed door, bar or
duty manager shift on one of tonight's performances is the ordinary way in, and it stops working
at 04:00 with nothing to revoke. Two roles open the screens anyway when the rota is wrong at
19:20: the Front of House Manager opens the door and the duty manager's screens, and the Bar
Manager opens the till. Every act they take there is recorded and flagged on the night report,
which is how the committee sees a rota that is not being kept; looking at a screen is not.
::

## If something goes wrong

- **"This needs a confirmed door shift on one of tonight's performances, or the front of house
  manager's role"** (or the same for a bar shift and the Bar Manager, or for a duty manager
  shift): nothing tonight gives you this screen. It shows as one card in place of the screen,
  naming tonight's duty manager to ask, with **Back to tonight**; none of the screen's own buttons is
  left to press. Find the person named, or ask the officer to assign you the shift on the rota. The
  IT Manager is never offered as the answer to a rota that is wrong. At the door the refusal also
  says tonight's duty manager can open it for their own performance, by first name if you hold a
  confirmed shift on that performance yourself.
- **"You are not on shift tonight."** on the hub: no role tonight opens any of the screens, so the
  hub shows **Emergency** and one card with **My rota**, where your shifts and the open ones are.
  Where you do hold something tonight that does not open a screen yet, such as a shift whose hours
  have not started or a claim not yet confirmed, the card says that instead, in the words below.
- **"Your door shift tonight is claimed, not confirmed yet: the Front of House Manager confirms
  it on the rota"** (or the same for a bar or duty manager shift): you claimed the shift, and it
  is waiting for an officer. A claim opens nothing until it is confirmed; ask the Front of House
  Manager to confirm it on the rota board.
- **"Your shift opens this from 18:30 to 23:00, and it is outside those hours"**: your shift is
  confirmed, and it opens its screens only between those times. Come back then; until then the
  hub's card says the same.
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
| The door | Door, or the duty manager's own shift on that performance | Front of house manager |
| Checklist, Night report, Backstage, and the glance's comp requests, rota and backstage code | Duty manager | Front of house manager |
| The till | Bar | Bar manager |
| Tonight at a glance and the hub's house numbers (access wording for the door and duty manager only), Contacts and incidents, Challenge 25 | Any of the three | Either |
| Emergency (the duty manager's number only for tonight's team at that venue) | None: anyone signed in | None |

A door shift does not open the till, and the Front of house manager's role does not either; the
roles are not interchangeable. The one crossing is the duty manager covering the door: their
confirmed shift opens the door and pass admission for their own performance, inside their own
hours, and nothing more. The show night runs from 04:00 to 04:00, so a performance that
finishes at 01:00 is still tonight, and a screen left open past 04:00 is refused rather than
quietly moved on to the next night.

Nothing on these screens refunds a ticket. The box office refunds a paid ticket in person, at the
desk, on any day: take the person's booking reference and pass it to the Front of House Manager.

## The hub

![The hub with the on-shift badge (1), the performance switcher (2), the house numbers (3), your own job's tile (4) and the Emergency tile (5)](/images/docs/show-night/hub.png)

1. **The badge** says how you got in: **On shift** with your first name, or **Officer** when a
   role opened the screen with no shift behind it.
2. **The performance switcher** appears only when the venue runs more than one performance
   tonight, a matinee and an evening, one row per house so none hides off the edge. The clock picks
   the house whose doors are open now; a press holds your choice until you press another.
3. **The house numbers** are the three words every show-night screen uses for the house:
   **sold** (tickets sold, paid or not) against capacity, **in** (people admitted through the
   door) and **seats left** (capacity less sold, or **No cap** where the house is uncapped).
   They refresh on their own every 20 seconds; a dropped connection leaves the last numbers on
   screen with a warning rather than a spinner, and the **Last synced** line at the top of every
   screen says how old what you are looking at is. Any of tonight's shifts sees them.
4. **Your own job**, first and in gold. For the Front of House Manager, who holds the door and the
   duty manager's screens, it is **Tonight at a glance**; on a door shift it is **Door**, which
   opens [the door](/docs/tonight/door) for tickets and passes alike.
5. **Emergency** opens [the emergency card](/docs/tonight/emergency), which is cached on
   the phone the moment any show-night screen opens.

Each tile appears where your own shift or role opens it, and your own job comes first, in gold:
**Door** on a door shift, **Till** on a bar shift, **Tonight at a glance** for the duty manager
until the curtain comes down on the performance you are looking at, and **Night report** after it,
reading **Sign off and close**, since that is where the night ends. The rest follow in the order
they are pressed on a night: **Door**, **Till**, **Tonight at a glance**, **Checklist**, **Night
report**, **Challenge 25**, **Backstage**, **Contacts and incidents**, and **Emergency**, always
there and always last. While a stocktake is open, a bar shift also sees **Stocktake** straight
after **Till**, to count into it (see [Stocktakes](/docs/bar/stocktakes#counting-on-a-bar-shift)).
Until the phone knows your roles, or with no signal, every tile shows, and
each screen still checks for itself. The **Checklist** tile says what is left on it: **3 pre-show
items left** before the house opens, **2 post-show items left** after, **All ticked** when nothing
is outstanding. On a matinee day the **Tonight at a glance**, **Checklist**, **Night report** and
**Contacts and incidents** tiles carry the house you chose on the switcher, so each opens on it. The
line at the foot of the hub is the rule the whole night runs on: the door never sells tickets;
unpaid and walk-up customers go to the bar.

The duty manager also sees **Waiting on you** above the tiles whenever a comp request is
waiting, with its value, who asked and **Approve** or **Decline**, the same queue
[the glance](/docs/tonight/tonight-at-a-glance) carries. An ask lapses in minutes, so it waits
where the duty manager already is.

From house open (doors, or curtain where no doors time is set) the hub shows a warning naming any
required pre-show checklist item that is still not done.

## The screens

::card-group
  ::card{icon="i-lucide-scan-line" title="Door" to="/docs/tonight/door"}
  Scan the code, or type a reference or a name; PAID, UNPAID, PASS or a named refusal.
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
  Tonight's report as it fills in, what is left after the curtain, and Sign off and close.
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
  Unanswered card charges, closing the till, then Sign off and close on the night report.
  ::
::

## What happens next

An officer acting on a screen with no shift (admitting at the door, selling at the till, ticking
the checklist, logging an incident, closing the night, or reading tonight at a glance) writes one
audit entry per night, venue and role, and the night report's staffing section names the officer
and the role. Only looking at a screen records nothing. A shift holder writes nothing extra: the rota's own
claim and confirmation are the record of how they came to hold it. Every admission, sale, check
and incident logged from these screens keys to a performance, never to a day.

## Related pages

- [My rota](/docs/my-nnt/my-rota)
- [Roles and permissions](/docs/getting-started/roles-and-permissions)
- [Shift templates](/docs/rota/shift-templates)
