# Copy style

K-128. This is the standard the sweep in K-128 criterion 2 will apply, surface by surface, once
this document is reviewed and merged. Nothing else changes as part of landing it.

## 1. Who this is for and what it governs

Every string a person reads on a screen, in an email or in a notification: page titles,
descriptions, button labels, table columns, toasts, refusals, error text, empty states, and the
subject and body of everything in `server/utils/templates.ts`.

It does not govern the editorial pages under `content/` (about, history, get involved, technical
specification), which are the committee's own words once supplied (0051), nor the policy pages
J-110 and J-111 add, which quote configured figures rather than house copy. A heading or label
wrapping one of those pages still follows this guide; the page's own prose does not.

## 2. Tone

Plain, warm, direct. Say what happened and what to do about it, in that order. No exclamation
marks; nothing here needs one to be worth reading. No jokes in a refusal: the reader came to book
a room or fix a sign-in, not to be entertained. No apology where nothing went wrong: a full house
or a lapsed membership is not a mistake anyone made.

Second person for the reader ("you", "your"). "We" for the theatre after the first mention of it
by name. "The SU" for the Students' Union after the first full mention on a page.

This was inconsistent, and is resolved: `templates.ts`'s `set-password` template said "The theatre
has made you an account", never "we", while its `membership-recording-failed` template said "We
could not record the membership you told us about." "We" won, being what most of the file already
did and warmer without being less precise, and the K-128 sweep moved the rest of the file onto it.
`tests/unit/templates.test.ts` keeps it that way.

## 3. Register by shell

Four shells, one posture each (0040):

- **`default`** (public, expressive): full sentences, unhurried. `app/pages/index.vue`'s hero
  description reads "The country's only entirely student-run theatre." One marquee CTA per view,
  verb first: "Book a room", "Sign in".
- **`member`** (your own things, calm): full sentences, second person, no jargon. `app/pages/
  account/membership.vue` reads "Your membership runs until {day}." and "We cannot sell it here.
  Once you have bought it, tell us below and an officer will record it on your account."
- **`console`** (sit-down work): imperative labels, terse, nouns for columns and verbs for
  buttons. `shared/utils/site-nav.ts`'s console groups are nouns throughout: "Ledger entries",
  "Room requests", "Revenue by show". Buttons match: "Delete", "Revoke".
- **`tonight`** (standing up, on a phone): two or three words per control, no sentences on a
  button. `app/pages/tonight/index.vue` labels its actions "Door", "Till", "Backstage board",
  "Emergency card".

A string written for one shell reads wrong in another: "Ledger entries" is cold on a public page,
and a full sentence costs a duty manager time they do not have mid-interval on a till screen.

## 4. Glossary

One word for each thing, checked against `docs/data-model.md` and 0043.

| Use | Not | What it means |
| --- | --- | --- |
| Performance | Show, for a dated slot | A dated, timed slot a booking is made against. Everything record-like keys to a performance, never a day or a venue. |
| Show | Performance, for the production | The production itself: title, category, the performances under it. |
| Membership | Member, for the state | Being current with the SU, checked at booking, shown on `/account/membership`. |
| Member | Membership, for the person | The person. "A member books", never "a membership books". |
| Ticket | Reservation, booking, hold | A `reservations` row with `sold: true` (D-104): paid, or to be paid at the box office. |
| Reservation | (no reader-facing use) | The table and the API's word (`POST /api/reservations`). A reader never sees it. |
| Booking | Reservation, facing the reader | The reader's word for a reservation, sold or not: `book/[performanceId].vue` says "View your booking". |
| Hold | Reservation, booking | The state before release or payment, in the booking policy's words: "An unpaid booking is released N minutes before curtain, and the seats go back on sale" (`book/[performanceId].vue`), `hold_expires_at`. |
| Room | Venue, space, in body copy | A bookable part of the estate, with opening hours, a policy, a blackout calendar. |
| Venue | Room | Where a performance happens: its own row, an address, an emergency card; may point at a room (0043). |
| Space | Room, venue, outside navigation | Only the nav group's umbrella word (`site-nav.ts`'s "Spaces"). Body copy says room or venue. |
| Shift | Rota, for one slot | One role on one performance: door, bar, duty manager. |
| Rota | Shift, for the whole schedule | The schedule and its screens, `/rota/manage/*`. "Your rota", never "your shifts". |
| Claimed | Filled, on shift, for a claim | A shift somebody has claimed that an officer has not yet confirmed. It is not filled and opens nothing on the night: a show-night list reads "Tomasz Nowak, claimed, not confirmed", never lists a number for it, and a refusal says the shift is claimed and who confirms it (E-112 criterion 2, issue 1303). Filled means confirmed. |
| Module | Session, record, certification | The catalogue entry: a course, of kind `MODULE`, `CERTIFICATION` or `BRIEF`. |
| Session | Module | One scheduled delivery of a module, signed up for and attended or not. |
| Record | Session, certification | What a member holds once a module is awarded: current, expiring or lapsed. |
| Certification | Record, module as a loose word | Not a separate object: a module of kind `CERTIFICATION`. A finished course is always a "record". |
| Pass | Ticket | A `pass_types` entitlement, bought once, admitted against many performances. |
| Officer | Committee, crew | A person holding a standing role with a permission, expiring each committee year (0009). |
| Role titles | Title Case: the IT Manager, the Bar Manager, the Safety Officer | A role is a proper title, capitalised wherever it is read, sentence-initial or not. The wording comes from `ROLE_WORDING` in `shared/utils/roles.ts`, never hand-typed. |
| Committee | Officer, crew | The collective body: "committee direction", "the committee's own words" (0051). |
| Crew | Officer | Backstage participants who join a show night with a short code, no account (`tonight/board.vue`). |
| The SU | SU, the union | The Students' Union, abbreviated only after the first full mention on a page. |
| Sign in / sign out | Log in, login, logon | Already the practice: `AuthStatus.vue` uses "Sign out" throughout; nothing in `app/` says "log in". |
| Email | E-mail | Already the practice: no hyphenated form appears under `app/`, `shared/` or `server/`. |
| Postcode | Post code, post-code | One word, no hyphen, wherever an address is collected. |
| Paid | Collected, for a booking | A booking whose money has been taken, whoever took it: the door's PAID card and the till's confirmation both say it (K-128, issue 1150 item 16). |
| In | Admitted, collected, for a person | Through the door. `HUB_KPI_LABELS` carries the three house words, sold, in and seats left, and every show-night screen reads them from there. |
| Exception | Closed over, exempted | A checklist item answered with a reason instead of a tick. The control is "Make an exception", the record reads "Exception: …", and the night report prints the reason. |
| Backstage code | Tonight's code, board code | The six digits a crew device joins the backstage board with. Revealed on request with "Show the code" and put away with "Hide the code". |
| Ticks itself | System-verified | A checklist item that reads the live data rather than being hand-ticked. |
| Booker | Patron, customer, theatregoer | Somebody with a booking. Anyone else on the public site is a visitor, and somebody current with the SU is a member (K-128, issue 1151 item 12). |
| Serving size | Variant, in anything a person reads | A size a product sells at. The catalogue row says "Serving size", a sentence says "size", and the till says "size" (0083). |
| Show category | Category, on its own in the box office | The grouping a show belongs to. |
| Product category | Category, on its own in the bar | The grouping a product sits in on the till. |
| Stock group | Category, for a stocked item | The free text that groups the order list. It is not a product category. |
| Need | Category, for an access profile | One of the standard access needs an access profile ticks. |
| Retire | Archive, for a catalogue thing | Off the till or the estate, its history kept. "Bring back" reverses it. |
| Hide | Retire, for something reversible | Off the till for now. "Put on the till" reverses it. |
| Close | Retire, for a period or a night | A period or a night stops taking entries. |
| Remove | Delete, retire, for something with no history | A template, a lead, a note, a poster: nothing to keep. |
| Revoke | Remove, for a grant | A grant is taken away. |
| Web address | Address, for a slug | The last part of a public page's address, lowercase words joined by hyphens. A postal address is a "postal address" and an email is an "email address". |

## 4a. The public shell's settled words

The K-128 sweep of the public shell (issue 1152 item 8) settled four wordings that were said
several ways each. All four live in `shared/utils/programme.ts`, so a screen asks for them rather
than spelling its own.

| Thing | The one wording | Where it comes from |
| --- | --- | --- |
| A full house | "Sold out" | `saysAvailability()`. Never "Full", never "House full"; `listingFlag()` takes its sticker from the same function. |
| A fact nobody has settled | "To be confirmed" | `TO_BE_CONFIRMED`. Never "Not yet priced", "Dates to be announced", "None stated" or "Not yet confirmed". |
| Paying | "You pay at the box office when you arrive." | `SAYS_PAYMENT`, paired with `SAYS_BOOKING_HOLDS` ("Booking online holds your seats.") where the reader needs both. No line item is drawn for the nought paid online: a row for nothing is a row to read. |
| The act of booking | "Book" | One verb, so a button reads "Book tickets", "Book your seats", "Book 3 tickets" or "Book tickets elsewhere", never "Reserve", "Pick" or a bare "Book". |

A thing that is no longer there says so through `saysNoSuch()` in `shared/utils/no-such.ts`, which
a page reaches the same way a route does.

## 5. The shape of a refusal

What happened, what to do, where to go: one sentence each at most, in that order. Reuse the
policy's own wording; never paraphrase it into something new. No internal ids, no table or column
names. Link to the fixing screen where one exists.

Already the practice in `shared/utils/booking-policy.ts`:

> "Booking a room needs a current membership. Renew it at the Students' Union."

paired, in `rooms/book.vue` and its equivalents, with a link to `/account/membership` (the A-129
pattern). The same file's other refusals hold the shape without needing a link, because nothing
fixes them elsewhere: "That slot has already happened", "The room is closed that day".

A message of one sentence carries no full stop; two or more sentences carry all of them.
"Somebody booked that slot first" against "That link has expired or has already been used. Ask
for a new one." The rule holds for a field message as much as for the sentence a refusal sends.

This used to break down where a refusal named a parameter rather than saying what to do:
`server/api/admin/roles/index.get.ts` threw `'Invalid request: userId'`. It now says "Say which
account you mean", and `server/utils/validation.ts` no longer lists field keys either. Where a
failed check has no wording of its own, the sentence comes from the house error map in
`shared/utils/house-errors.ts`, registered once on each side, so a reader never sees the
validation library's own English.

## 5a. The member shell's settled words

The K-128 sweep of the member shell (issue 1153 item 8) settled the wordings that were said
several ways each, and put each of them in one place.

| Thing | The one wording | Where it comes from |
| --- | --- | --- |
| The membership state | "Current", "In grace", "Lapsed", "None" | `MEMBERSHIP_WORDING` and `saysMembershipState()` in `shared/utils/membership.ts`; the sentence beside the badge is `saysMembershipSentence()` in `shared/utils/my-summary.ts`, which the My NNT tile reads too. |
| A membership a member needs | "Tell us about your membership" | The refusal links to `/account/membership`, which is where telling us happens. Never "Sort out your membership". |
| What we send | "Notification" | The nav, the settings page and the inbox all say it. Never "message". |
| Room bookings in the nav | "My room bookings" | `site-nav.ts`. "Bookings" on its own is the reader's word for tickets (section 4), and the notification topic keeps it. |
| The officer who decides | The role in Title Case where one role decides ("the Theatre Manager", "the Accessibility Officer", "the department lead"); "an officer" where the permission decides and no one role holds it | Never "somebody". A room request has no approver role: whoever holds `rooms.write` may decide it, so "an officer" is the true word there. |
| A declined training request | "Declined" | `saysRequestStatus()` in `shared/utils/training.ts`. "Answered" hid a refusal behind a softer word. |
| The people working the door | "the people on the door", "anybody working the door" | Never "the door" as a shorthand for them: a member choosing what is shown is choosing who sees it. |

## 6. The shape of an error

Something went wrong, distinct from a refusal: say so plainly, say whether to retry, never blame
the reader, never show a stack trace or a status code. `app/utils/refusal.ts`'s fallback is the
model: "That did not work. Try again." Neither it nor the `membership-recording-failed` template
in section 2 guesses at whose fault it was.

A console list whose read did not finish says what could not be read in the alert's title, from
`useListFailure`, and adds one house sentence under it, `READ_AGAIN`: "Try again. If it keeps
happening, tell the IT Manager." Eight screens each carried their own paragraph before the K-128
sweep; a screen that writes its own again fails `tests/unit/admin-conventions.test.ts`.

## 7. The shape of an empty state

Say what would appear here, and the one action that makes it appear. Never "No data".

Already inconsistent. `bar/categories.vue` and `box-office/ticket-types.vue` both name the action:
"No categories yet. Add one and products have somewhere to sit." and "No ticket types yet. Add one
and a performance has something to sell." `people/accounts/index.vue` falls back to a bare "No
accounts yet.", naming nothing to do. The action-naming form wins: it is what most of the console
already does, and a bare "yet" leaves the reader guessing whether they may do anything at all.

A screen still reading has not found nothing yet, so it never shows its empty state and never a
bare "Loading…": a table carries its own loading state, and anything else holds its place with
`USkeleton` until the first read finishes (issue 1151 item 7).

## 8. Buttons and labels

Verb first, object second, sentence case, no trailing punctuation. "Save" not "Submit": `account/
access.vue` still has one `'Submit'`, next to `'Save changes'` on the same button's other state;
"Save changes" wins.

A toast confirming an action names the thing and what happened to it, sentence case, no full stop:
"Role revoked", "Venue deleted", "Signed out everywhere", "Adult pass issued". Every action that
succeeds says so; one that succeeds in silence leaves the reader pressing it again.

Destructive verbs are named for what they do, not left as bare "Delete". `rooms/mine.vue` already
does this: "Cancel the whole series", "Cancel the booking". Set against that, `box-office/ticket-
types.vue`, `pass-types.vue`, `venues.vue`, `seasons.vue` and several bar screens all use a bare
`'Delete'` for a retiring action. The named form wins: "Delete" tells nobody what is about to
happen to a row other things may point at.

One marquee CTA per public view (`docs/design-language.md`): `app/pages/index.vue` already keeps
to it, and its comment above `<template #links>` names the budget explicitly.

## 9. Numbers, money, dates and times

Money is pence until formatted, and formatted the one way: `saysPrice()` in `shared/utils/
ticket-types.ts` returns `£12.50`, never a bare number.

Dates and times are Europe/London and take two shapes: short in a list, "Wed 14 Oct, 19:30", and
long in prose, "Wednesday 14 October at 19:30". Both come from `shared/utils/when.ts`, which fixes
the separators the locale would otherwise choose for itself: `saysWhen()` and `saysWhenLong()` for
an instant, `saysDay()` and `saysDayLong()` where only the day is meant, and `saysClock()` for a
time on its own. Each takes an epoch number (seconds, or milliseconds above 1e11), a `Date`, an
ISO string, or a `YYYY-MM-DD` London day, and each pins the zone by construction, so nothing
builds its own options object. `formatLondon()` (`shared/utils/london.ts`) is the mechanism
underneath, and a page, a component or a shared helper calls the shapes rather than it.

A year is shown only when the date falls outside the committee year in hand (0009), or when the
caller asks for it with `{ year: true }`. An input keeps its machine value: only what is read
changes. `toLocaleDateString`, `toLocaleString` and `toLocaleTimeString` are banned under `app/`,
and `tests/unit/admin-conventions.test.ts` and `tests/unit/design-language.test.ts` enforce that
and the ban on a bespoke options object, the second against a named list that may shrink and may
not grow.

The show night runs 04:00 to 04:00 (0014): a booking or a shift made at 01:00 belongs to the
previous calendar date on screen.

Counts use `plural()` from `shared/utils/text.ts`: `plural(2, 'booking')` reads "2 bookings",
`plural(1, 'booking')` reads "1 booking", never "1 booking(s)".

## 10. Mechanics that bind copy

A code comment in a `.vue` file stays within `check:comments`' two-line limit as everywhere else;
UI strings themselves are not comments and are not bound by it.

No em dash anywhere, in any string. K-128 criterion 4 adds a unit test enforcing this under `app/`,
`shared/` and `content/`; name it as coming when you touch a string, because it will fail a build
that reintroduces one.

A stored value never reaches a screen. An enum value, a permission or audit code, a table name
and a configuration key are the estate's own vocabulary, not the reader's: each has a `says*`
helper or a `*_WORDING` map beside the enum in `shared/utils/`, and that is what a page shows,
including in a select's options. `tests/unit/admin-conventions.test.ts` fails a console screen
that shows one, and `tests/unit/code-wording.test.ts` fails a value nobody has worded.

British spellings, the ones that recur: organise, colour, recognise, apologise, licence (noun),
practise (verb), programme (except a computer program). Already the practice throughout the
codebase, for example `shared/utils/seasons.ts`.

The coming unit test also holds a banned-spelling list: `e-mail`, `login` as a verb, `logon`,
`signup` as a verb, `cancelled` with one L, `center`, `color`, `organize`. `cancelled` is already
spelled with two Ls everywhere, for example `shared/utils/audit-coverage.ts`'s
`room.booking.cancelled`; the test exists to keep it that way as the sweep touches more files.

## 11. A reviewer's checklist

1. Second person for the reader, "we" for the theatre, no exclamation marks, no jokes in a refusal.
2. Register matches the shell: full sentences off the console, terse imperatives on it, two or
   three words on `tonight`.
3. Glossary word used correctly: performance vs show, room vs venue vs space, shift vs rota.
4. A refusal says what happened, what to do, where to go, in that order, in the policy's own words.
5. An error never blames the reader and never shows an id, a table name or a status code, and
   no screen shows an enum value, a permission or audit code or a configuration key.
6. An empty state names the one action that fills it; never a bare "No X yet."
6a. A column is headed by a noun ("Request", "Detail", "Subject"), never by a question put to
    the reader ("Who and what", "Why it is here", "To whom").
7. A button is verb first, sentence case, no trailing punctuation; a destructive one names what it
   destroys.
8. Money is pence until `saysPrice`; dates use `saysWhen`, `saysWhenLong`, `saysDay`,
   `saysDayLong` or `saysClock`, not a bespoke format.
9. No em dash; British spelling; none of the banned American or verbed forms.
10. Nothing here touches `content/` or the policy pages.
