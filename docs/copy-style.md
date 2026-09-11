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

Already inconsistent. `templates.ts`'s `set-password` template says "The theatre has made you an
account", never "we", while its `membership-recording-failed` template says "We could not record
the membership you told us about." "We" wins: it is what most of the file already does, and it is
warmer without being less precise.

## 3. Register by shell

Four shells, one posture each (0040):

- **`default`** (public, expressive): full sentences, unhurried. `app/pages/index.vue`'s hero
  description reads "The country's only entirely student-run theatre." One marquee CTA per view,
  verb first: "Book a room", "Sign in".
- **`member`** (your own things, calm): full sentences, second person, no jargon. `app/pages/
  account/membership.vue` reads "Your membership runs until {day}." and "We cannot sell it here.
  Once you have bought it, tell us below and an officer will record it on your account."
- **`console`** (sit-down work): imperative labels, terse, nouns for columns and verbs for
  buttons. `shared/utils/site-nav.ts`'s console groups are nouns throughout: "Stocked items",
  "Room requests", "Revenue by show". Buttons match: "Delete", "Revoke".
- **`tonight`** (standing up, on a phone): two or three words per control, no sentences on a
  button. `app/pages/tonight/index.vue` labels its actions "Door", "Till", "Backstage board",
  "Emergency card".

A string written for one shell reads wrong in another: "Stocked items" is cold on a public page,
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
| Hold | Reservation, booking | The state before release or payment: "Hold these seats" (`book/[performanceId].vue`), `hold_expires_at`. |
| Room | Venue, space, in body copy | A bookable part of the estate, with opening hours, a policy, a blackout calendar. |
| Venue | Room | Where a performance happens: its own row, an address, an emergency card; may point at a room (0043). |
| Space | Room, venue, outside navigation | Only the nav group's umbrella word (`site-nav.ts`'s "Spaces"). Body copy says room or venue. |
| Shift | Rota, for one slot | One role on one performance: door, bar, duty manager. |
| Rota | Shift, for the whole schedule | The schedule and its screens, `/rota/manage/*`. "Your rota", never "your shifts". |
| Module | Session, record, certification | The catalogue entry: a course, of kind `MODULE`, `CERTIFICATION` or `BRIEF`. |
| Session | Module | One scheduled delivery of a module, signed up for and attended or not. |
| Record | Session, certification | What a member holds once a module is awarded: current, expiring or lapsed. |
| Certification | Record, module as a loose word | Not a separate object: a module of kind `CERTIFICATION`. A finished course is always a "record". |
| Pass | Ticket | A `pass_types` entitlement, bought once, admitted against many performances. |
| Officer | Committee, crew | A person holding a standing role with a permission, expiring each committee year (0009). |
| Committee | Officer, crew | The collective body: "committee direction", "the committee's own words" (0051). |
| Crew | Officer | Backstage participants who join a show night with a short code, no account (`tonight/board.vue`). |
| The SU | SU, the union | The Students' Union, abbreviated only after the first full mention on a page. |
| Sign in / sign out | Log in, login, logon | Already the practice: `AuthStatus.vue` uses "Sign out" throughout; nothing in `app/` says "log in". |
| Email | E-mail | Already the practice: no hyphenated form appears under `app/`, `shared/` or `server/`. |
| Postcode | Post code, post-code | One word, no hyphen, wherever an address is collected. |

## 5. The shape of a refusal

What happened, what to do, where to go: one sentence each at most, in that order. Reuse the
policy's own wording; never paraphrase it into something new. No internal ids, no table or column
names. Link to the fixing screen where one exists.

Already the practice in `shared/utils/booking-policy.ts`:

> "Booking a room needs a current membership. Renew it at the Students' Union."

paired, in `rooms/book.vue` and its equivalents, with a link to `/account/membership` (the A-129
pattern). The same file's other refusals hold the shape without needing a link, because nothing
fixes them elsewhere: "That slot has already happened.", "The room is closed that day."

Where this breaks down: `server/api/admin/roles/index.get.ts` throws `'Invalid request: userId'`,
which names a parameter rather than saying what to do. It still reaches a screen, so it is in
scope: something closer to "Say which account you mean." is what the shape asks for.

## 6. The shape of an error

Something went wrong, distinct from a refusal: say so plainly, say whether to retry, never blame
the reader, never show a stack trace or a status code. `app/utils/refusal.ts`'s fallback is the
model: "That did not work. Try again." Neither it nor the `membership-recording-failed` template
in section 2 guesses at whose fault it was.

## 7. The shape of an empty state

Say what would appear here, and the one action that makes it appear. Never "No data".

Already inconsistent. `bar/categories.vue` and `box-office/ticket-types.vue` both name the action:
"No categories yet. Add one and products have somewhere to sit." and "No ticket types yet. Add one
and a performance has something to sell." `people/accounts/index.vue` falls back to a bare "No
accounts yet.", naming nothing to do. The action-naming form wins: it is what most of the console
already does, and a bare "yet" leaves the reader guessing whether they may do anything at all.

## 8. Buttons and labels

Verb first, object second, sentence case, no trailing punctuation. "Save" not "Submit": `account/
access.vue` still has one `'Submit'`, next to `'Save changes'` on the same button's other state;
"Save changes" wins.

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

Dates and times are Europe/London, read via `formatLondon()` (`shared/utils/london.ts`), and take
two shapes: short components in a list, "Wed 14 Oct, 19:30", and long components in prose,
"Wednesday 14 October at 19:30". The split already exists: `whats-on.vue` uses short weekday, day
and month for its list; `shows/[slug].vue` uses long forms for its prose. Neither yet fixes the
literal separator this rule asks for, since `formatLondon` renders whatever `Intl.DateTimeFormat`
chooses; the sweep should add the two shared helpers that fix it once, rather than each page
building its own options object as it does today.

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
5. An error never blames the reader and never shows an id, a table name or a status code.
6. An empty state names the one action that fills it; never a bare "No X yet."
7. A button is verb first, sentence case, no trailing punctuation; a destructive one names what it
   destroys.
8. Money is pence until `saysPrice`; dates use `formatLondon` in the shell's shape, not a bespoke
   format.
9. No em dash; British spelling; none of the banned American or verbed forms.
10. Nothing here touches `content/` or the policy pages.
