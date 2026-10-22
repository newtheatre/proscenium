# Access matrix

Every member-facing route: the ability that guards it, what a lapsed membership refuses and in
whose words, and where that refusal sends somebody (A-129). Navigation is never filtered by
membership (0040): a lapsed member sees every screen here and is refused, with a reason, only when
they try the one thing on it that needs a current membership.

`tests/unit/access-matrix.test.ts` globs `app/pages` for a member layout or `signed-in` middleware
and fails when a page is missing from this table. Keep the two in step.

Membership itself is `hasMembership` on the `Viewer`, carried as `membershipState` (`current`,
`grace`, `lapsed` or `none`) rather than a boolean, because grace needs its own date (0031). The
`member` ability is `current` only; `memberOrGrace` also admits a renewal still inside its grace
window, which is what every write path below actually checks, because a renewal in hand should
not be a refusal at a desk (0031).

## My NNT

| Route | Ability | Membership requirement | Sent to |
| --- | --- | --- | --- |
| `/my` | `signedIn` | None: a lapsed member sees every tile, including "Membership" reading lapsed (A-129 criterion 2). | n/a |
| `/my/notifications` | `signedIn` | None: the inbox is your own notifications, whatever membership state the account is in. | n/a |

## Account

| Route | Ability | Membership requirement | Sent to |
| --- | --- | --- | --- |
| `/account/access` | `signedIn` | None: access requirements are recorded whatever membership state the account is in. | n/a |
| `/account/bar-tab` | `signedIn` | None: a tab charge is authorised per holder by the Front of House Manager's role, not gated on membership here. | n/a |
| `/account/membership` | `signedIn` | None: this is the page a lapsed member is sent to, so it has to render lapsed. | n/a |
| `/account/notifications` | `signedIn` | None. | n/a |
| `/account/passes` | `signedIn` | None: a pass is ticketing, sold to anybody, not a member benefit (0031, A-202). | n/a |
| `/account/profile` | `signedIn` | None. | n/a |
| `/account/security` | `signedIn` | None. | n/a |

## Rooms

| Route | Ability | Membership requirement | Sent to |
| --- | --- | --- | --- |
| `/rooms` | `signedIn` | None to browse the calendar. | n/a |
| `/rooms/book` | `signedIn` to view; `POST /api/rooms/bookings`, `POST /api/rooms/series` and `POST /api/rooms/requests` check `memberOrGrace` server side (`mayBookRooms`), which `rooms.write` stands in for (0200). | Refused outright (`NO_MEMBERSHIP`, `judge()` in `shared/utils/booking-policy.ts`): "Booking a room needs a current membership. Buy one at the Students' Union." to somebody who never held a term, "... Renew it at the Students' Union." to a lapsed member (`saysBookingNoMembership`, from `hasEverBeenMember`). Not divertible into a request (`NOT_DIVERTIBLE`). | `/account/membership`, linked in place of the form when the viewer reads as lapsed (`booking-needs-membership`) and from the failure alert otherwise (`booking-membership-link` in both), with the SU's own purchase page beside it (`booking-membership-buy`) where `MEMBERSHIP_PURCHASE_URL` is set (A-202); unset, the notice says "Memberships are sold on the Students' Union website, not here." (`MEMBERSHIP_SOLD_WHERE`) instead. |
| `/rooms/external` | `signedIn` to view; `POST /api/rooms/external-requests` checks `memberOrGrace`, which `rooms.write` stands in for (0200). | Refused (`NO_MEMBERSHIP`, `judgeExternal()` in `shared/utils/external-requests.ts`): "Asking for a room needs a current membership. Buy one at the Students' Union.", or "... Renew it at the Students' Union." to a lapsed member (`saysExternalNoMembership`). | `/account/membership`, linked in place of the form when the viewer reads as lapsed (`external-needs-membership`, which also says "Memberships are sold on the Students' Union website, not here.") and from the failure alert otherwise (`external-membership-link` in both). |
| `/rooms/mine` | `signedIn`; `PUT /api/rooms/bookings/[id]` re-runs `judge()` for a pending request. | None to view or cancel your own booking: neither is re-gated by today's membership state. Changing a pending request is a request re-asked, so a lapsed membership refuses it outright (`NO_MEMBERSHIP`). | n/a |

## Show night and training

| Route | Ability | Membership requirement | Sent to |
| --- | --- | --- | --- |
| `/rota` | `signedIn` | None yet. 0031 reserves the rota as something confirmation, not membership, may one day gate; nothing does today. | n/a |
| `/tonight/emergency` | None to reach. Signed in: every venue running tonight's card, shift or none (E-113 as amended by issue 1310). Signed out: each venue's name, address and what3words with Call 999, and nothing else of the card (0237). The duty managers' numbers show only to tonight's team at that venue, and a cached copy's only to the account that fetched it (A-114). | None: the card is the building's safety information. | Nowhere: a signed-out phone stays on the card, with a **Sign in** button for the rest. |
| `/tonight` and every other `/tonight/*` screen | `signedIn` to reach, through the `night-signed-in` middleware; each screen's own work is guarded by tonight's shift or the night permission (E-111, 0044). A session read that fails for want of signal is not a sign-out, so a cached screen still draws offline. | None. | `/sign-in` when signed out. |
| `/training` | `signedIn` | None. | n/a |
| `/training/sessions` | `signedIn` | None: signing up for a session does not check membership. | n/a |
| `/training/sessions/[id]/register` | `signedIn` to reach; the register itself is gated by `runTrainingSessions` (`training.write` or a current trainer standing), not membership. | None. | n/a |

## Documentation

| Route | Ability | Membership requirement | Sent to |
| --- | --- | --- | --- |
| `/docs` | `signedIn` | None. Served by the catch-all from `content/docs/index.md`. | n/a |
| `/docs/[...slug]` | `signedIn` | None. Every page in the tree; the collection's own query and dump routes carry the same gate (0076). The tree and search hide `committee` pages from a viewer with no live role or standing permission, as navigation rather than a guard (0093). | n/a |

## Reached without an account

These have no member layout and no `signed-in` middleware by design: a booking reference, a pass
reference or a backstage code stands in for a session, so `tests/unit/access-matrix.test.ts` does
not require them here. Listed anyway, because A-129 named them explicitly.

| Route | Ability | Membership requirement | Sent to |
| --- | --- | --- | --- |
| `/passes` | `anybody`, by the reference in the link a pass was issued with. | None: a pass is not a membership benefit. | n/a |
| `/qr` | `anybody`, by the cookie a booking confirmation set or a resend by reference and email. | None: booking a ticket has never needed membership; only a member-restricted price does (see below). | n/a |
| `/board` | `anybody`, by tonight's join code. Carries no account at all (E-120). | None. | n/a |
| `/help`, `/help/[...slug]` | `anybody`. Public help, its own collection, with an open dump and query route; nothing in it is operator documentation (0093). | None. | n/a |

## Elsewhere membership is read

Not pages, but where `hasMembership` (`hasCurrentMembership` server side) is read for something a
member does, so a reviewer looking for every consumer finds them from here rather than by grep.

| What | Reads | Effect |
| --- | --- | --- |
| Booking a ticket (`POST /api/reservations`) and its QR follow-ons (`/api/qr/*`) | `memberOrGrace` | Decides which prices the booking may use; not a refusal, because ticketing is open to everybody (D-101). |
| A public show page's prices (`/shows/[slug]`) | The ticket type's `restrictedTo` column, not the viewer | A price marked `MEMBER` says "Current members only" next to its figure, so a visitor knows before they sign in (criterion 5). |
| The admin directory's `members-current` and `members-lapsed` filters, and the register export | `currentMembership()` (`server/utils/directory.ts`) | Officer-facing, not this matrix's scope; same grace-inclusive sum. |
