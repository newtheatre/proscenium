# 1. Scope and glossary

The Spaces module lets members ask for a room or a shared resource at a time, checks the request against the theatre's rules and everything else in that room, and confirms it at once or sends it to someone to decide. It is module `spaces`, switchable, requires nothing but core, and owns seven tables.

## What it does

- **A calendar per space.** Bookings, repeating series, performances and closures on one view, by day or week, for one space or several side by side.
- **Requests.** A member picks a space, a time and what the booking is for. The system answers with one of three things: confirmed, sent for approval, or refused with the rule that refused it.
- **Rules.** Who may book what, how far ahead, for how long, with how much notice, and inside which hours. Rules are set per purpose and may be tightened per space.
- **Priority decided by the system.** Each purpose has a tier. The booker chooses the purpose and never the tier.
- **Clashes.** Two confirmed bookings never overlap in the same space. A performance or a closure in the space always wins.
- **Approval.** A queue for the people who hold the deciding ability on a space, with every clash shown beside the request.
- **Bumping.** A higher-tier request may displace a lower-tier booking, with notice, through approval, and with a message to the person displaced.
- **Cancellation and no-shows.** The booker cancels their own; staff record a no-show.
- **Spaces the theatre does not control.** A request is recorded, a member of staff places it with the outside owner and records the answer.
- **Resources that are not rooms.** A van, a rehearsal piano, a projector: booked the same way.

## What it does not do

| Not here | Where it is |
| --- | --- |
| Defining venues, spaces and closures | Core. This module adds booking facts to a space and never edits the space itself |
| Scheduling performances | Core. A performance is never a booking; it appears on the calendar and outranks every booking |
| Rehearsal schedules, call sheets and availability | Production management, later. It will make bookings through this module's services |
| Charging for a hire, deposits, invoices | Not in the first release. See question 6 |
| Requests from the public with no account | Not in the first release. A hire enquiry is a form (Form builder), which may later create a request here |
| Equipment loans with condition on return | Inventory. A resource here is only something with a diary |
| Rota and shifts | Front of house |
| Rooms that combine or divide (a hall that splits in two) | Later. See question 7 |

## Glossary

This module owns these words. Words owned elsewhere are used as their owners define them: space, venue, closure and operating day are core's; grant, role, side and account are Identity's; ability, fact, point, setting and unit of work are Foundations'.

| Word | Meaning |
| --- | --- |
| bookable | Something with a diary that can be booked: a core space the theatre has made bookable, or a resource. Every booking is for exactly one bookable |
| resource | A bookable that is not a room, such as a van. It belongs to this module, not to core |
| external bookable | A bookable the theatre does not control. Its diary here is only what the theatre has asked for |
| booking | One person's use of one bookable from a start to an end. "Booking" alone always means a room or resource booking. A ticket purchase is an order, which is Box office's word |
| request | A booking in the state Requested: asked for, not yet decided |
| purpose | What a booking is for, chosen by the booker from the theatre's list: rehearsal, meeting, maintenance |
| tier | A purpose's priority, a whole number where 1 is highest. Never chosen by the booker |
| series | A set of bookings made together from one repeat rule. Each occurrence is its own booking |
| occurrence | One booking of a series |
| clash | Two things wanting the same bookable at overlapping times |
| blocker | Anything that makes a time unavailable: a confirmed booking, a performance, a closure |
| decision | An approver confirming or declining a request |
| approver | A person holding `spaces.booking.decide` on the bookable. Not a role name |
| room manager | The words stories and interface copy use for a person who looks after bookings day to day: an approver who may also manage bookings. Not a role key. In the presets it is Identity's technical-manager role |
| bump | To displace a confirmed booking in favour of a higher-tier one. The displaced booking's state is Bumped |
| notice | The time between an act and the start of the booking it affects |
| opening hours | The weekly hours inside which a bookable may be booked without an override |
| override | Booking outside a rule, by a person holding `spaces.booking.override`, with a reason |
| no-show | A confirmed booking nobody used, recorded afterwards by staff |
| origin | The record in another module that a booking was made for, such as a rehearsal call |

### Words that needed a ruling

| Word | Clash | Use here |
| --- | --- | --- |
| booking | Box office speaks of "booking" tickets and core has the "booking action" | In this document "booking" is a room or resource booking. In the interface the menu entry is "Room bookings", never "Bookings" alone. Across modules the words are always "room booking", as integration ruled for the shared glossary |
| request | Identity has a data request; Box office has a complimentary request | Always "booking request" outside this document |
| hold | Already ruled: "erasure hold" or "seat hold" | This module does not use the word. A request does not hold a time (rule C4) |
| space | Core's record | Never used to mean a bookable. A resource is not a space |
| state | Core's performance state, Box office's sale state | "Booking state" |

## Assumptions carried in

1. Settings are site-wide. Where a value varies by purpose or by bookable it is a column on that record that falls back to the setting (Foundations' ruling of 16 November 2026).
2. Single tenant, one database, D1. Every write goes through a unit of work.
3. The members' side only. An audience account never sees this module (Matt's decision of 16 November 2026 on separating the two sides).
4. Times are stored as instants and shown in the theatre's time zone. A day on the calendar is a calendar day, not an operating day, because a room diary runs from morning; the day's first and last displayed hours are settings.
