# Booking and the box office

How a ticket gets from the website to a bum on a seat. This is the part of the system that runs
live, in a foyer, operated by a volunteer who was trained ten minutes ago. Read it before changing
anything a customer or a front-of-house volunteer touches.

## The model in one paragraph

Tickets are **reserved online and paid for on collection**. There is no payment integration at all:
money is taken in person, in cash or on the card reader, and the system records what was owed rather
than evidence that it was paid. That was true of the legacy Django system since 2016 and it is still
true. Anything you design has to work with it.

## 1. Public booking

**Page:** `app/pages/whats-on/[slug]/book.vue`: a four-step stepper: performance → tickets →
details → confirm. Everything it needs comes from one call to `GET /api/whats-on/:slug`.

**Handler:** `server/api/bookings/index.post.ts`.

```
POST /api/bookings
{ performanceId, tickets: [{ ticketTypeId, quantity }], customerNotes?, name?, email? }
```

Order of operations:

1. Validate the body. Max 10 per ticket type, at least one ticket.
2. Guests must supply name and email; logged-in users must not.
3. Load the performance. Must be `ON_SALE`, its show must be `PUBLISHED`, and `startsAt` must be
   in the future.
4. **Capacity check**: see §3.
5. Resolve the user: session user, or an existing user with that email, or a new shadow account.
6. Resolve effective prices through the override chain (`loadTicketPriceContext` →
   `resolveEffectivePrice`).
7. Insert the reservation (`status: PENDING`), then insert one `tickets` row per seat with
   `pricePaid` snapshotted.
8. Re-query the booking and fire the confirmation email through `waitUntil`.

**Three things to know:**

- **It is not transactional.** Shadow user, reservation and tickets are three separate statements. A
  failure between steps 7a and 7b leaves a reservation with no tickets, which still appears on the
  door list. D1 has no interactive transactions; the fix is `db.batch()`.
- **The capacity check is read-then-write with no lock.** Two simultaneous bookings can both pass it.
- **A guest booking with an email that already belongs to a registered account silently attaches to
  that account.** The booking then appears in that person's account area. The booking reference is
  only returned to whoever made the booking, so the exposure is limited to writing into someone
  else's list, but it is worth knowing about.

## 2. Staff booking (walk-in)

**Component:** `app/components/BoxOffice/WalkInModal.vue` → `POST /api/reservations`.

A near-duplicate of the public handler: same shadow-account logic, same price resolution, same
non-transactional inserts. Differences that matter:

| | Public `/api/bookings` | Staff `/api/reservations` |
|---|---|---|
| Max per ticket type | 10 | 20 |
| Capacity checked | ✅ | **❌ none** |
| Performance status | must be `ON_SALE` | any, including `DRAFT`/`CANCELLED` |
| Accepts `userId` | - | ✅ |
| Accepts `staffNotes` | - | ✅ |

The staff path deliberately allows overriding the rules: a manager selling into a cancelled
performance is doing so knowingly. The missing capacity check is not deliberate; it means the box
office can oversell the house with no warning.

After creating the reservation, the UI immediately opens the collection modal so taking payment is
one continuous flow.

## 3. Capacity

**The definition**: one sentence, and every implementation should match it:

> Count `tickets` joined to `reservations` where the reservation status is `PENDING`, `COLLECTED` or
> `DOOR`, `tickets.refundedAt IS NULL`, and the ticket type's `kind` is not `PASS_SALE`. Compare
> against `performance.capacityOverride ?? venue.capacity`. A `NULL` capacity means unlimited.

`CANCELLED` and `NO_SHOW` release their seats. That is correct and intended.

`PASS_SALE` is excluded because such a row records the **purchase** of a pass, not a seat at this
performance: the seat is the separate `PASS_ADMISSION` ticket. Counting both makes one buyer
consume two seats.

**Where it lives:** `countOccupiedSeats()` in `server/utils/tickets.ts`, and nowhere else. Every
write path enforces it through `assertCapacity()`; every display path counts with the same function.
Do not write a second copy: there used to be four, and they disagreed in ways that were invisible
until someone was turned away at the door.

**Enforced by:** `POST /api/bookings`, `POST /api/reservations`, both `PUT .../tickets` routes,
`POST /api/passes/:id/redeem`, and `PUT /api/reservations/:id` when a cancelled reservation is
reinstated (its seats re-enter the count). `PUT .../performances/:id` refuses to set
`capacityOverride` below what is already sold.

**Still true:** the check and the write are separate statements, so two concurrent bookings can both
pass. There is **no database constraint** backing capacity: it is advisory application logic. See
[09-known-issues](./09-known-issues.md#capacity-is-still-read-then-write).

## 4. The door: collection and no-shows

**Screen:** `app/pages/admin/box-office/reservations.vue`. Requires `BOX_OFFICE` or above. The
show-night screen at `/foh/scan` is a second way in for door volunteers
([11-show-night-screen-design](./11-show-night-screen-design.md) §2.1); it looks a booking up but
does not collect.

**"Is this paid?" has exactly one answer**, `bookingStanding()` in
`server/utils/reservationLifecycle.ts`, derived from the status lifecycle rather than re-read per
screen. The door, the scanner and later the bar till all call it. The door and the bar disagreeing
about whether a booking is paid is the worst show-night bug available, which is why it is one
function and not three.

It opens on today's performance, or warns if there isn't one. Prev/next walks every non-cancelled
performance chronologically, wrapping around. There is a status summary, a search by reference, name
or email, and a capacity readout.

### Collecting

1. Find the customer. Click **Collect**.
2. `CollectModal` loads the reservation and the currently-effective ticket types, showing a stepper
   per type seeded from the tickets already on the reservation.
3. Adjust if they want fewer or more. Take the money.
4. Confirm → `PUT /api/reservations/:id/tickets` if anything changed, then
   `PUT /api/reservations/:id { status: 'COLLECTED' }`.

**Watch this:** the modal displays totals using the *current* effective price, not the historical
`pricePaid` on the existing tickets. If a price changed between booking and collection, the customer
is charged the new price. Usually harmless; not what the snapshot was for. See
[06-pricing-and-ticket-types](./06-pricing-and-ticket-types.md).

### No-shows

Individually from the collect modal, or **Mark all as no-show** for the whole performance. The bulk
action fires N parallel `PUT`s; a partial failure leaves mixed state and shows a generic error.

The button is available before curtain-up, and will tell you off with a rotating selection of jokes
if you press it early. That is deliberate and should be preserved: it is the only bit of the
interface that acknowledges it is used by tired volunteers at 19:25.

### `DOOR` is currently unreachable

The walk-in flow creates `PENDING` and the collect modal sets `COLLECTED`. Nothing sets `DOOR`
except editing a reservation by hand. **Pre-booked and on-the-door revenue therefore cannot be told
apart** in the dashboard or the treasurer's CSV. The fix is one line in the walk-in handler; see
[09-known-issues](./09-known-issues.md#door-status-is-never-set).

## 5. What the customer gets

This app sends three emails, all about bookings. Registration, verification and password reset are
the auth service's and are not sent from here ([04-auth-and-permissions](./04-auth-and-permissions.md)).

| Event | Email | Status |
|---|---|---|
| Booking created | Confirmation with reference, show, date, tickets, total, and a QR | Sent |
| Reservation cancelled by staff or customer | Cancellation notice | Sent |
| Booking reminder | Written, never called | No scheduler exists |

**The QR encodes `/t/<ref>?t=<token>`**: the short booking handle, carrying the same signed token
this email's own link already carries, so it exposes nothing the email did not already contain. The
reference alone still grants nothing ([ADR-0009](./decisions/0009-signed-booking-access-tokens.md));
access is the token, as everywhere else. It is attached inline (`cid:`) rather than linked, because
email clients block remote images by default and Gmail strips `data:` URIs. The design and the
front-of-house side of it are [11-show-night-screen-design](./11-show-night-screen-design.md) §3.

An earlier revision of this section reported that every link in these emails was broken, from
`baseUrl` against `baseURL`, and that the booking link 404'd because it used the reference where the
endpoint wanted a nanoid. **Both were fixed** and are recorded in
[09-known-issues](./09-known-issues.md) under Fixed, items 1 and 2.

**Customers cannot cancel their own booking.** `updateReservation` is staff-only. The schema and UI
both support `cancelledBy: 'CUSTOMER'`, but only staff can set it, on the customer's behalf. The
legacy system had self-service cancellation via an emailed link; this is a regression.

## 6. Things the flow does not do

Worth knowing before someone promises one of them:

- No payment, online or otherwise.
- No seat selection. Unreserved seating only.
- No holds or expiry: a `PENDING` reservation from 2026 will still be there in 2028.
- No waiting list for sold-out performances.
- No payment integration, so a "refund" is a record that money was handed back at the desk, not a
  card reversal.
- No group or school bookings beyond raising the quantity cap.
- No passes-by-post or transfers between holders, but passes themselves exist, see
  [10-passes-design](./10-passes-design.md).

## 7. Editing versus refunding

The rule the write paths enforce, because it was previously implicit and the two paths contradicted
each other:

**Nothing is paid until the tickets are collected.**

| Reservation status | Tickets editable? | Refundable? |
|---|---|---|
| `PENDING` | ✅ by the customer or the box office | ❌ nothing has been paid |
| `COLLECTED`, `DOOR` | ❌ | ✅ ADMIN/MANAGER only |
| `CANCELLED`, `NO_SHOW` | ❌ | ❌ |

Before collection a booking is an intention: adding and removing tickets is free, and removing one
is not a refund because nothing was taken. After collection the composition is a record of a
completed transaction: editing it would delete paid-for tickets with nothing to show that anything
was returned, so the only way to reverse part of it is `POST /api/reservations/:id/refund`, which
stamps `refundedAt` and leaves the row in place as the audit trail.

Implemented in `server/utils/reservationLifecycle.ts` and applied by both ticket-diff routes and the
refund route. The collect screen edits tickets *before* setting the status, which is why that flow
still works.

Refunded tickets stop counting towards capacity and revenue, and are excluded from anything the
customer sees: their confirmation page, their account page and the self-service editor all filter
them out.
