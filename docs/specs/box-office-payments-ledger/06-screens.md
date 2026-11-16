# 5. Screens

## Principles for these screens

- **The audience shell never mentions membership.** A buyer sees shows, tickets and their orders. A member who is signed in sees the same screens, with any member price already applied through the eligibility point.
- **No account is needed to buy.** A guest gets their order by an emailed link. Signing in is offered after the sale, never before it.
- **Phone first.** Checkout, the door and the desk are all designed at phone width first; the desk also has a two-column layout for a tablet.
- **The price shown is the price paid.** Fees appear as soon as there is a basket, not at the last step.
- **Every money screen sends the total it showed.** If the server computes a different total, it refuses and shows both figures.

The wireframes show layout and wording, not visual design; workstream 6 owns the look. Example show names, prices and times are illustrations.

## Audience shell

| Screen | Route | What it does | Release |
| --- | --- | --- | --- |
| Booking action | part of the core's show and performance pages | The contribution to `core.booking-action`: Book, On sale from, Sold out and join the waiting list, Sales closed | First |
| Choose tickets | `/book/<performance>` | Ticket types with steppers, what is left, promo code, access needs | First |
| Choose seats | `/book/<performance>/seats` | The seat map, for allocated performances | Allocated-seating phase |
| Check and pay | `/book/basket` | Countdown, lines, fee, total, contact details, pay | First |
| Paying | provider's page or embedded form | Card entry belongs to the provider; the platform never sees a card number | First |
| Booked | `/book/done/<token>` | Reference, tickets, calendar link, manage link | First |
| Payment did not complete | `/book/problem/<token>` | Says plainly what happened: declined (try again, seats still held), or still checking (we will email you) | First |
| Manage booking | `/orders/<token>` | View tickets, reissue, cancel or exchange where the theatre allows | First: view and reissue. Later: self-service cancel and exchange |
| Join the waiting list | `/book/<performance>/waiting-list` | Party size and email | First |
| Waiting-list offer | `/book/offer/<token>` | "2 seats are held for you until 6:40 pm" and straight to Check and pay | First |
| Buy a pass | `/passes` | Season tickets and multi-show passes | Later |

&#91;embedded content: online checkout wireframe · 3 phone screens\]

What the three screens must get right:

- **Choose tickets.** The button says what it will do and what it costs. "14 seats left" appears only at or below `box-office.availability.show-remaining-under`. A companion ticket cannot be added without a paid ticket. Pressing the button runs the claim batch; if the house filled in the meantime the screen says how many are left and offers the waiting list.
- **Check and pay.** The countdown is always visible and is announced to screen readers at fixed points, not every second. When it ends the screen says the seats were released and offers to try again. The access-needs question is one optional field with a plain explanation of who will read it.
- **Booked.** Shown only after the order is confirmed in the database. If the provider sends the buyer back before its answer has arrived, the screen waits and polls rather than guessing.

## Account shell

| Screen | Route | What it does | Release |
| --- | --- | --- | --- |
| My tickets | `/account/tickets` | Upcoming and past orders for a signed-in person, each opening Manage booking | First |
| My passes | `/account/passes` | Passes held and uses left | Later |

## Console shell: box office

| Screen | Route | Ability | What it does | Release |
| --- | --- | --- | --- | --- |
| Sell | `/console/box-office/sell` | `box-office.order.sell` | The desk: pick a performance, add tickets, take payment | First |
| Orders | `/console/box-office/orders` | `box-office.order.view` | Search by name, email or reference; filter by performance and state | First |
| Order | `/console/box-office/orders/<id>` | `box-office.order.view` | Lines, tickets, payments, refunds, history; actions to resend, reissue, cancel, exchange, refund | First; exchange later |
| Door | `/console/box-office/door/<performance>` | `box-office.ticket.admit` | Scan, find by name, live counts | First |
| Door list | `/console/box-office/door/<performance>/list` | `box-office.ticket.admit` | Everyone expected, with admitted state and access notes; printable | First |
| Performances | `/console/box-office/performances` | `box-office.performance.manage` | Every performance with its sale state, sold and free | First |
| Performance set-up | `/console/box-office/performances/<id>` | `box-office.performance.manage` | Bands and capacity, prices, on-sale window, limits, holds; a checklist of what blocks going on sale | First |
| Staff holds | within Performance set-up | `box-office.hold.manage` | Hold, label, release, sell from a hold | First |
| Waiting list | within Performance set-up | `box-office.waitlist.manage` | The queue, offers out, make an offer by hand | First |
| Ticket types and prices | `/console/box-office/pricing` | `box-office.pricing.manage` | Ticket types site-wide; a price grid per production | First |
| Promo codes | `/console/box-office/codes` | `box-office.promo.manage` | Create, limit, retire; uses so far | First |
| Complimentary tickets | `/console/box-office/comps` | `box-office.comp.request`, `.approve` | Request, approve, issue | First |
| Passes | `/console/box-office/passes` | `box-office.pass.manage` | Pass types and passes issued | Later |
| Seating plans | `/console/box-office/plans` | `box-office.plan.manage` | Draw and publish a plan | Allocated-seating phase |
| Sales report | `/console/box-office/reports/sales` | `box-office.report.view` | By performance, ticket type and channel; export | First |
| Bulk cancellation | reached from the core's cancel flow | `box-office.performance.manage` | The change guard's decision: refund all, offer exchange, or keep | First |

&#91;embedded content: desk sale wireframe · 1 tablet screen\]

What the desk must get right:

- **One screen, no pages.** A sale is three taps for the common case: add, add, Card reader.
- **Selling needs an open till session.** The first visit asks for the float; the bar across the top shows the session throughout.
- **The card button names the reader.** After it is pressed the screen says "Waiting for the reader" with a Cancel button, and nothing else can be sold on that reader. The sale completes only on the reader's answer. If no answer comes in time the screen says so honestly and offers "Check again" and "The reader says approved" (attested, recorded against the person), never a silent success.
- **Cash asks what was handed over** and shows the change.
- **Finding an order** from the same screen covers collection, reprints and "I've lost my email".
- **Complimentary tickets cannot be typed in.** The row opens the approved requests waiting to be issued.

## Console shell: the door

&#91;embedded content: door scanning wireframe · 3 phone states\]

What the door must get right:

- **One word, one colour, one sound** per scan, readable at arm's length in a dark foyer, and never colour alone: the word and an icon carry the meaning too.
- **The reason for a refusal is specific** (already in, with when and where; wrong performance, with which one; cancelled; not one of our tickets) so the steward can deal with it without a supervisor.
- **Works offline** after the manifest has loaded, shows that it is offline, and shows how many scans are waiting to send.
- **An access note shows that it exists**, not what it says, until tapped by someone with `box-office.order.view-access-note`.
- **Find by name** for a buyer with no phone and no printout.

## Console shell: payments and finance

| Screen | Route | Ability | What it does | Release |
| --- | --- | --- | --- | --- |
| My session | `/console/payments/session` | `payments.session.open` | Open with a float; cash up with a count; variance reason | First |
| Sessions | `/console/payments/sessions` | `payments.session.view` | Every session, expected against counted | First |
| Needs attention | `/console/payments/attention` | `payments.attempt.reconcile` | Attempts with no answer, unfulfilled payments, failed refunds | First |
| Refunds | `/console/payments/refunds` | `payments.refund.approve` | Requests waiting, with who asked and why | First |
| Providers and readers | `/console/payments/providers` | `payments.provider.manage` | Add a provider, pair a reader, test mode, health | First |
| Ledger | `/console/finance/ledger` | `finance.ledger.view` | Postings with their entries; filter by account, production, performance, period; every row links to its source | First |
| Accounts | `/console/finance/accounts` | `finance.account.manage` | Chart of accounts; rename and recode | First |
| Periods | `/console/finance/periods` | `finance.period.close` | The close checklist, close, reopen with a reason | First |
| Production statement | `/console/finance/productions/<id>` | `finance.ledger.view` on that production | Income, fees and refunds for one production, for a visiting company's settlement | First |
| Reconciliation | `/console/finance/reconcile` | `finance.ledger.view` | Clearing account balance against provider payouts | First: totals. Later: line matching |
| Export | `/console/finance/export` | `finance.ledger.export` | CSV of postings for an accounting package | First |

## States every screen has

Each screen above is specified with its empty, loading, error and refused states. The ones that matter most here:

| Screen | State | Shows |
| --- | --- | --- |
| Choose tickets | Sold out while choosing | How many are left, and the waiting list |
| Check and pay | Hold expired | "Your seats were released" and a way back |
| Check and pay | Total mismatch | Both figures and "prices changed while you were booking" |
| Sell | No open session | Open one |
| Sell | Reader busy or offline | Which, and the other ways to pay |
| Door | Before doors | "Doors open at 7:00 pm"; a supervisor may start early |
| Periods | Close blocked | The list of what blocks it, each a link |

## Added 16 November: collecting a reservation at the desk

This is the screen for reserve now, pay on arrival (part 3). It lives in the console shell on a laptop, as Interface's journey 3 "Sell at the desk" does, and is the same desk screen with a reservation loaded into it. The figures are examples.

&#91;embedded content: Desk · collecting a reservation, with bar items in the same payment\]

The right-hand panel is where another module adds its lines through `payments.desk-basket`; with no such module switched on, the panel shows only the amount to pay. If the reader gives no answer the screen stays on this reservation as awaiting payment and offers Check again and Cancel; another method is offered only once the first attempt is known to have failed, so nobody pays twice.

For the buyer, reserving is the ordinary checkout with a different ending. The pay step is replaced by Reserve, and the email confirmation screen appears only when that setting is on and the buyer is not signed in.

&#91;embedded content: Public checkout · the last three screens when the theatre takes payment on arrival\]

The "collect by" line appears only when the theatre has set a release time, and quotes it from the setting.

## Checked against Interface's conventions, 16 November

Read against the Interface specification's Key journeys and Page conventions. Where the two differ, the side to change is named.

| Convention (Interface) | This specification | Outcome |
| --- | --- | --- |
| Checkout in short steps: performance, tickets, basket, details, pay, confirmation; no account wall | Same steps; the hold starts at the basket | Agrees |
| The theatre takes no online payment: the journey ends in Reserve | The `reserved` state | Agrees. One addition for Interface: with email confirmation on, a "check your email" step sits between details and the reserved confirmation |
| A warning with one minute left and a button to extend the hold, once | Editing a basket never extends its countdown | Adopted here: one extension by button, its length a setting, never by editing |
| An expired basket is kept as a wish and "Try again" re-holds | Expired baskets release their claims | Adopted here: the lines are remembered in the browser; nothing is held |
| Allocated seating picks "Best available" first, with "Choose my own seats" | BO-71 led with the map | Adopted here for the seating phase |
| Money screens show the expected total and refuse on a mismatch, showing both | The same rule on every money-taking service | Agrees |
| Desk: anonymous sale when no customer is chosen | Null-account order, desk only | Agrees |
| Desk: the reader does not answer: Retry, Take cash instead, Cancel | Another method only after the attempt is known to have failed | Interface to change: "Take cash instead" appears once the attempt is final, otherwise a customer can pay twice |
| Desk: pay with a pass or a voucher | Passes are later; there are promo codes, not vouchers | Interface to change for the first release |
| Desk: "Mark collected" on a prepaid order | No collected state; tickets are resent, shown or admitted | Interface to change: Resend, Show, or Admit |
| Door band shows any access note the customer agreed to share | The door shows only that a note exists | Kept here: the note is special-category data and the door screen is seen by the queue. Interface to change |
| Door runs in live mode, dark, large targets, offline | Offline scanning on by default | Agrees. Addition: a desk code scanned at the door answers "Not paid. Send to the desk" in the red band |
| Refunding your own order is refused | A requester cannot approve their own refund | Agrees |
