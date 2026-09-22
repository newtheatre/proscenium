---
title: System
description: The console overview, the settings, the audit trail, backups and restore, and how this documentation is kept.
module: Platform
updatedOn: 2026-09-22
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

## Who reaches the console

The console is reached by anybody holding a standing permission that is administrative rather
than operational. A door, till or duty manager shift opens tonight's screens and never the
console; an officer whose only permissions are those three is shown no **Manage** link at all.
Within the console each screen checks its own permission, so a person who can reach the
overview may still be refused a screen the sidebar does not show them.

- **Settings** are read by the IT Manager, the Manager and the Theatre Manager, and changed by
  the IT Manager alone.
- **The audit trail** is read by the IT Manager, the Manager and the Theatre Manager, and the
  same three record an entry on it.
- **Backups** are the IT Manager's alone.

Every standing role expires at the end of the committee year, 31 July, so a permission held in
June is gone in August unless the incoming committee grants it again.

## The overview

![The console overview with the help link (1) and the list of messages that did not arrive (2)](/images/docs/system/overview.png)

1. **Help for this screen** opens the documentation page for the screen you are on. Every
   console, member and show-night screen carries one.
2. **Messages that did not arrive** lists every send that never reached a person, newest first,
   with why. It is for whoever reads the audit trail, and reads as empty ("Nothing has failed
   or been suppressed")
   rather than as a refusal when you hold something else.

Each line carries a badge saying what happened: **The provider refused it** (the email or
push provider returned a failure), **Not sent** (the message was suppressed before it went), or
**Spoken for** (it is still in the queue). Beside the person's name and the message type is the
reason: **muted this topic**, **has not proved their address**, **the account is gone**, **the
account was erased**, or **no reason recorded**. A failure here is a person who was not told
something, so it belongs in front of the committee rather than in a log nobody opens.

**Published shows nobody has assessed for content warnings** appears only when there is at least
one, and only to somebody holding a ticketing permission. A published show with no warnings and
no confirmation that there are none says exactly that on its public page, which is honest and
is not the answer anybody wants. Each title links to the show, where the assessment is recorded:
see [Content warnings](/docs/box-office/content-warnings).

The rest of the overview arrives with the stories that need it, and the screen says so.

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
::

## Related pages

- [Roles and permissions](/docs/getting-started/roles-and-permissions)
- [Finding your way](/docs/getting-started/finding-your-way)
- [Send log](/docs/communications/send-log)
