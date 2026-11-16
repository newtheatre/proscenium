# 5. Screens

Spaces has four screens in the members' area and eight in the console, each one of the Interface conventions' page types. The calendar is Interface's shared Calendar component (its story UI-35); Spaces draws none of its own and says here only what the calendar shows.

## Where they sit

| Shell | Address | Page type | Shown to holders of |
| --- | --- | --- | --- |
| Members | `/members/spaces` | List, calendar view | `spaces.calendar.view` |
| Members | `/members/spaces/book` | Form | `spaces.booking.request` |
| Members | `/members/spaces/bookings` | List | `spaces.booking.request` |
| Members | `/members/spaces/bookings/<id>` | Record | The booking's owner |
| Console | `/console/spaces` | List, calendar view | `spaces.booking.view` |
| Console | `/console/spaces/requests` | List | `spaces.booking.decide` |
| Console | `/console/spaces/bookings` | List | `spaces.booking.view` |
| Console | `/console/spaces/bookings/<id>` | Record | `spaces.booking.view` |
| Console | `/console/spaces/bookables` | List | `spaces.bookable.manage` |
| Console | `/console/spaces/bookables/<id>` | Record | `spaces.bookable.manage` |
| Console | `/console/spaces/purposes` | List, with a Record per purpose | `spaces.purpose.manage` |
| Console | `/console/spaces/settings` | Settings | `spaces.settings.manage` |

Navigation entries (`core.navigation`). With `menu: 'members'`, one entry, "Room bookings", icon `i-lucide-calendar-clock`. With `menu: 'console'`, six entries in the group labelled "Room bookings": in the section `everyday`, Calendar, Requests (with the count `spaces.requests-open` as a badge) and All bookings; in the section `setup`, Rooms and resources, Purposes and Settings. No entry has the menu `account` or `live`, and nothing is on the public site. A person reads "Room bookings" everywhere: the group, every entry, page title, card and message. Only the module id and the addresses say spaces.

## Members' area

### Calendar

The page a member lands on. Its primary action is **Book**.

- **Views.** Day (bookables side by side as columns), Week (one bookable, seven days), and List (the same data as rows grouped by day). List is the default below the tablet breakpoint and is always one control away.
- **Choosing bookables.** A picker grouped by venue, then resources. The choice and the view are remembered per person as a saved view.
- **What is drawn.** Confirmed bookings as solid blocks in the bookable's colour. The viewer's own requests as outlines. Performances as a distinct block labelled with the production. Closures as a hatched band across the columns they cover. Public holidays as a note at the head of the day. Hours outside opening hours are shaded.
- **What a block says.** Time, then whatever rule K2 allows: purpose, title, booker. The viewer's own bookings are marked "Yours".
- **Never colour alone.** State is also a word and a border style, so the calendar reads in greyscale and to a screen reader.
- **Starting a booking.** Selecting an empty time, by pointer or keyboard, opens the request form with the bookable and time filled. Book opens it empty.
- **Empty state.** With no bookable the viewer may see: "No rooms are set up for booking yet." With bookables and nothing booked: the empty grid and the Book button.
- **Loading and failure.** The standard components. A failed load keeps the last drawn window and says so.

### Book a room

A Form page, one column, in this order.

1. **What for.** The purposes open to this person, each with its one-line description. If only one is open it is chosen already.
2. **Production.** Shown only when the purpose needs one: the productions this person is on the team of.
3. **Where.** Bookables that allow the purpose. External ones are grouped under "Not ours: we ask on your behalf" with the approval note.
4. **When.** Date, start and end in slot steps. A strip beside it shows that day for the chosen bookable, so free time is visible without leaving the form.
5. **Repeat.** Off by default. Frequency, days, and an end by date or count.
6. **Title**, **How many people**, **Notes for the approver**.
7. **Extra questions** (later, story SP-38) from the form slot `spaces.booking-request`, if the theatre has set any for this purpose.
8. The bookable's guidance text.

As the person fills it in, the form calls the check route and shows one status line above the submit button:

| Status line | Button |
| --- | --- |
| "This time is free. Your booking will be confirmed straight away." | Book |
| "This time is free. A room manager will decide your request." | Send request |
| "We will ask the Students' Union for this room. You will hear when they answer." | Send request |
| "This would move a meeting already booked here. A room manager will decide." | Send request |
| "Taken from 14:00 to 16:00 by a performance. The nearest free time is 16:00 to 18:00." with a control to use it | disabled |
| "Rehearsals can be booked up to 60 days ahead." | disabled |

For a series, a panel lists every occurrence with its own status, and clashing ones carry a "leave out" control (rule R4). The button reads "Book 10 of 12".

After submitting, the person lands on the booking's page with a standard confirmation. A refusal at the moment of saving (someone else took the time) returns to the form with the status line updated and nothing lost.

### My bookings

A List page. Tabs: Upcoming, Requests, Past. Each row: date and time, bookable, title, state. A series shows as one row that opens to its occurrences. Empty state: "You have no room bookings" and the Book button.

### A booking

A Record page. Header: title, state, bookable, date and time. Body: purpose, production, attendees, notes, series link, the approver's note, and the history from `spaces_booking_events` in plain sentences ("Confirmed by a room manager on 3 March"). Actions depend on state:

| State | Actions |
| --- | --- |
| Requested | Edit details, Withdraw |
| Confirmed, not started | Edit details, Change time or room, Cancel |
| Confirmed, inside the cancellation notice | The same; Cancel warns "This is a late cancellation" |
| Bumped | Book again, which opens the form filled with the same details |
| Declined, Expired | Ask again |
| Any, made by another module | "Managed in" with a link to the origin; no edit controls |

For an occurrence, Change and Cancel first ask the scope: this one, this and later, all that have not started.

## Console

### Calendar

The same component as the members' calendar, with every bookable available, everyone's requests drawn as outlines, full detail always shown, and a "Book for someone" action that opens the form with a person picker first. A filter narrows by venue, purpose, state and production.

A theatre may switch the members' area off, and a member still holds the booking abilities through the fact `core.member`. So the console calendar, the request form and "my bookings" also open for anyone holding `spaces.booking.request`, who then sees there exactly what the members' pages would show. The Book button on a production's "Room bookings" tab is a second way in.

### Requests

A List page, and the approver's working screen. Only requests the viewer may decide are listed, soonest start first, urgent ones marked.

- **Row.** Bookable, time, purpose and tier, booker, how long it has waited, and badges: "Clashes with 2 other requests", "Would bump 1 booking", "External", "Series of 12", "Change to an existing booking".
- **Opening a row** shows, without leaving the list: the request in full; a strip of that day in that bookable with the request drawn in; each clashing request and each booking that would be bumped, with their bookers and tiers; the booker's no-shows and late cancellations in 90 days; the answers to any extra questions.
- **Actions.** Confirm, Decline (a note is required), and for an external bookable Mark as asked, then Confirm with a reference. Confirming something that bumps asks once, naming who will be displaced.
- **Own requests.** A request that is for the viewer is listed greyed with "Someone else must decide this".
- **Several at once.** Requests may be selected and confirmed together; any that fail are reported one by one and the rest stand.
- **Empty state.** "Nothing is waiting for a decision."

### All bookings

A List page with the standard filter, sort, saved views and export. Columns: time, bookable, title, purpose, booker, state, flags (late cancel, no-show, override). Saved views shipped: Today, This week, No-shows, Overrides.

### A booking (console)

The members' Record page with more: the booker as a link to their account, the notes, the override reason, the full history with actors, and actions Change, Cancel (with a note to the booker), Mark no-show, and Decide if it is a request the viewer may decide.

### Rooms and resources

A List page of bookables in two groups. For spaces, core's active spaces are all listed, each either bookable (with its state) or carrying a "Make bookable" action; a space is edited in core, and the row links there. "Add a resource" makes one.

A bookable's Record page has four tabs:

| Tab | Holds |
| --- | --- |
| Details | Control (ours or external), approval, approval note, external contact, guidance, colour, maximum length, state |
| Hours | A week grid of opening hours, or "Always open". Copy a day to others |
| Purposes | Every purpose with allowed or not, and approval: follow the purpose, automatic, or needs approval |
| People | Who can decide and who can book here, read from Identity, with a link to grant. The warning "Nobody can decide requests for this room" appears here |

### Purposes

A List page in tier order, with drag or keyboard reordering inside a tier. A purpose's page: name, description, tier, who it is open to, whether it needs a production, approval, the three limits (each "use the site setting" or a value), may repeat, can be bumped. Changing the tier states plainly: "Bookings already made keep their priority." A purpose in use is retired, never deleted.

### Settings

The standard Settings page for the keys in part 6, grouped as Booking limits, Approval, Bumping, Calendar and Records.

## Home cards and other placements

| Placement | Shows |
| --- | --- |
| Members' home card "My room bookings" | The next three, any request waiting, and Book |
| Console home card "Booking requests" | The count to decide and the oldest wait. Hidden for people who can decide nothing |
| Space and venue pages in the console, tab "Room bookings" | The next two weeks, and a link to the calendar filtered to it |
| Production page in the console, tab "Room bookings" | Upcoming bookings naming the production, total hours booked, and Book |

## Messages

Every email and inbox item follows the notification conventions: the subject states the outcome ("Your booking for Studio 1 on 3 March is confirmed"), the first line repeats it, and one button opens the booking. A bumped message gives the reason, the name of the role to contact (a setting), and a Book again button.

## Accessibility and small screens

- The List view is a full equivalent of the calendar, not a fallback: everything that can be done on the grid can be done from it.
- On the grid, arrow keys move by slot and by column, Enter starts a booking, and each block is a button with a full spoken label: "Studio 1, Tuesday 3 March, 14:00 to 16:00, rehearsal, Act 2 run-through, confirmed".
- Times are typed or picked; nothing depends on dragging.
- On a phone the request form is the primary route and the day strip sits under the time fields.

## Wireframes

Not drawn. The three that carry design risk are the day view with several columns, the request form with its status line and series panel, and the requests list with a row open. They are proposed as additions to the Interface workstream's prototype, drawn with its Calendar component.
