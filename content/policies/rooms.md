---
title: Room booking policy
description: The rules the booking system actually applies when you book a rehearsal room.
---

Every number on this page is read from the system's own settings as you load it, so this page and
the rules the booking screens apply are the same thing. When the committee changes a rule, it
changes here at the same moment, without anybody editing this page.

## How long, and how far ahead

A booking runs from {{ROOM_MIN_BOOKING_MINUTES}} at the shortest to {{ROOM_MAX_BOOKING_HOURS}} at
the longest. Administrators may book past that maximum: {{ROOM_MAX_BOOKING_ADMINS_EXEMPT}}.

You may hold {{ROOM_ACTIVE_BOOKINGS_PER_MEMBER}} active bookings at once, and a recurring series
counts each of its occurrences separately. A series runs to at most
{{ROOM_SERIES_MAX_OCCURRENCES}} occurrences.

The calendar opens {{ROOM_BOOKING_HORIZON_WEEKS}} ahead. That is a number of weeks rather than the
end of term, because the system holds no term dates to count to.

## What a room is for, and who comes first

Tell us what the room is for when you book: {{ROOM_PURPOSES}}. It is not the name of your
production, it is what will happen in the room, which is what makes a space suitable or not.

Where two bookings want the same room, priority runs {{ROOM_PRIORITY_TIERS}}, highest first. A
higher tier may take a slot from a lower one, and the member who loses it is told.

## Requests, and how long they wait

A booking made with at least {{ROOM_AUTO_APPROVE_NOTICE_HOURS}} of notice is confirmed straight
away. Anything shorter goes to the approval queue instead.

A waiting request is chased with the approvers after {{ROOM_REQUEST_ESCALATE_HOURS}}, and lapses
after {{ROOM_REQUEST_EXPIRE_HOURS}} if nobody has decided it. If it lapses, you are told, and you
are free to ask again.

For a room the theatre does not manage, we need {{EXTERNAL_REQUEST_NOTICE_WORKING_DAYS}} of notice
before the day you want it. Weekends and bank holidays are not working days, though the booking
itself may fall on one.

## Not turning up

Not using a room you booked keeps somebody else out of it, so it is counted. The ladder looks back
{{ROOM_NO_SHOW_WINDOW_DAYS}}, and it also clears at the end of the theatre's year, whichever
reaches less far.

Inside that window, {{ROOM_NO_SHOW_RECORD_AT}} no-shows are formally recorded against you, and at
{{ROOM_NO_SHOW_PREAPPROVAL_AT}} every further booking you make needs approving first. Cancelling a
booking you no longer need costs you nothing and is not a no-show.
