---
title: Communications
description: Sending an announcement to an audience, and reading what the system sent and what it could not.
module: Communications
updatedOn: 2026-09-15
updatedBy: Matt Adcock
navigation:
  title: Overview
  icon: i-lucide-send
---

Every message the theatre sends, whether an officer wrote it or the system did, leaves through
one notification centre. It resolves the address at the moment of sending, honours the member's
preferences, coalesces rapid changes into one email, logs every outcome and never hands an
anonymised or placeholder address to the mail provider (0013). The two screens here are the
composer for an announcement and the log of what went out. They are under **Manage,
Communications**.

::card-group
  ::card{icon="i-lucide-megaphone" title="Announcements" to="/docs/communications/announcements"}
  Composing a message to all current members, the holders of a role, tonight's rota or a
  session's sign-ups, previewing it, and sending it.
  ::
  ::card{icon="i-lucide-list" title="The send log" to="/docs/communications/send-log"}
  Every send with its outcome, the daily counts, one person's history, and what happens to a
  message the provider refused.
  ::
  ::card{icon="i-lucide-bell" title="Notification types" to="/docs/communications/notification-types"}
  Every message the system sends on its own, by module, with its channel, whether a member can
  switch it off, and which digest it can join.
  ::
::

## Who holds the permissions

Announcing needs `comms.announce` and the send log needs `comms.operations`. Neither is granted
to any committee role at present: only the IT Manager (the `ADMIN` role, which holds every
permission) reaches these screens. Which officers should hold them, and whether a
whole-membership send should need a second officer, is an open question the committee has not
yet answered, so the grant stays narrow until it does. Roles lapse at the committee year end,
31 July, like every standing grant.

## Where mail comes from

Every email carries one of five sender identities, each a real, replyable mailbox on
`newtheatre.org.uk` (0020): NNT Box Office (`boxoffice@`), NNT Room Bookings (`rooms@`),
NNT Training (`training@`), NNT Accounts (`accounts@`) and The New Theatre (`hello@`) for
announcements and shift news. Nothing is sent from a no-reply address, and the worker's mail
binding refuses any other sender.

## What a member controls

A member's own screen is **Notifications** in the My NNT strip (`/account/notifications`). It
shows five topics, Bookings, Shifts, Training, Room bookings and Committee announcements, each
with an email switch and a push switch, and says beside each whether the configured default is
on or off. In-app is always on: every message a preference could silence still lands in the
member's recent messages, so switching email off never loses one. Tickets, receipts, security
emails and safety notices are transactional and have no switch at all. Push is recorded but
nothing delivers it yet; the switch is a subscription for the day it does.

## Related pages

- [Your account](/docs/getting-started/your-account)
- [Roles and permissions](/docs/getting-started/roles-and-permissions)
- [Settings](/docs/system/settings)
