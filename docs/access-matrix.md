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

## Account

| Route | Ability | Membership requirement | Sent to |
| --- | --- | --- | --- |
| `/account/access` | `signedIn` | None: access requirements are recorded whatever membership state the account is in. | n/a |
| `/account/membership` | `signedIn` | None: this is the page a lapsed member is sent to, so it has to render lapsed. | n/a |
| `/account/notifications` | `signedIn` | None. | n/a |
| `/account/passes` | `signedIn` | None: a pass is ticketing, sold to anybody, not a member benefit (0031, A-202). | n/a |
| `/account/profile` | `signedIn` | None. | n/a |
| `/account/security` | `signedIn` | None. | n/a |

## Rooms

| Route | Ability | Membership requirement | Sent to |
| --- | --- | --- | --- |
| `/rooms` | `signedIn` | None to browse the calendar. | n/a |
| `/rooms/book` | `signedIn` to view; `POST /api/rooms/bookings` and `POST /api/rooms/series` check `memberOrGrace` server side (`hasCurrentMembership`). | Refused outright (`NO_MEMBERSHIP`, `judge()` in `shared/utils/booking-policy.ts`): "Booking a room needs a current membership. Renew it at the Students' Union." Not divertible into a request (`NOT_DIVERTIBLE`). | `/account/membership`, linked from the failure alert (`booking-membership-link`). |
| `/rooms/external` | `signedIn` to view; `POST /api/rooms/external-requests` checks `memberOrGrace`. | Refused (`NO_MEMBERSHIP`, `judgeExternal()` in `shared/utils/external-requests.ts`): "Asking for a room needs a current membership." | `/account/membership`, linked from the failure alert (`external-membership-link`). |
| `/rooms/mine` | `signedIn` | None: viewing or cancelling your own booking is not re-gated by today's membership state. | n/a |

## Show night and training

| Route | Ability | Membership requirement | Sent to |
| --- | --- | --- | --- |
| `/rota` | `signedIn` | None yet. 0031 reserves the rota as something confirmation, not membership, may one day gate; nothing does today. | n/a |
| `/training` | `signedIn` | None. | n/a |
| `/training/sessions` | `signedIn` | None: signing up for a session does not check membership. | n/a |
| `/training/sessions/[id]/register` | `signedIn` to reach; the register itself is gated by `runTrainingSessions` (`training.write` or a current trainer standing), not membership. | None. | n/a |

## Documentation

| Route | Ability | Membership requirement | Sent to |
| --- | --- | --- | --- |
| `/docs` | `signedIn` | None. | n/a |
| `/docs/[...slug]` | `signedIn` | None. | n/a |

## Reached without an account

These have no member layout and no `signed-in` middleware by design: a booking reference, a pass
reference or a backstage code stands in for a session, so `tests/unit/access-matrix.test.ts` does
not require them here. Listed anyway, because A-129 named them explicitly.

| Route | Ability | Membership requirement | Sent to |
| --- | --- | --- | --- |
| `/passes` | `anybody`, by the reference in the link a pass was issued with. | None: a pass is not a membership benefit. | n/a |
| `/qr` | `anybody`, by the cookie a booking confirmation set or a resend by reference and email. | None: booking a ticket has never needed membership; only a member-restricted price does (see below). | n/a |
| `/board` | `anybody`, by tonight's join code. Carries no account at all (E-120). | None. | n/a |

## Elsewhere membership is read

Not pages, but where `hasMembership` (`hasCurrentMembership` server side) is read for something a
member does, so a reviewer looking for every consumer finds them from here rather than by grep.

| What | Reads | Effect |
| --- | --- | --- |
| Booking a ticket (`POST /api/reservations`) and its QR follow-ons (`/api/qr/*`) | `memberOrGrace` | Decides which prices the booking may use; not a refusal, because ticketing is open to everybody (D-101). |
| A public show page's prices (`/shows/[slug]`) | The ticket type's `restrictedTo` column, not the viewer | A price marked `MEMBER` says "Current members only" next to its figure, so a visitor knows before they sign in (criterion 5). |
| The admin directory's `members-current` and `members-lapsed` filters, and the register export | `currentMembership()` (`server/utils/directory.ts`) | Officer-facing, not this matrix's scope; same grace-inclusive sum. |
