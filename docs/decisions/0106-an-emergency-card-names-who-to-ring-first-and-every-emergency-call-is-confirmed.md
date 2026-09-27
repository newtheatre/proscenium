# 0106: An emergency card names who to ring first, and every emergency call is confirmed

- Status: Proposed
- Date: 2026-09-27
- Amends: E-113 criterion 4 (the "Read to 999" block and the pinned Call 999)

## Context

The emergency card (E-113) told every venue to ring 999, and its pinned **Call 999** dialled on
the first tap. At the University's campus venues (the Studio, Studio Live, the Trent Building and
the Monica Partridge Building) the procedure is to ring estates security instead (issue 1519,
reported from the emergency screen on 27 September 2026). The same report asked for a confirmation step: a button that rings
999 or security on one tap in a pocket or a dark foyer is a false call waiting to happen.

Nothing in the schema could say which venue follows which procedure. `venues` has no campus
flag, and the one `campus` column in the estate (`rooms.campus`) is a free-text place name on
bookable rooms, which most performance venues are not.

## Decision

**A venue's emergency card may name who to ring first: a name and a number, both or neither.**
They are two nullable columns on `venue_emergency_info`, `first_call_name` and
`first_call_phone`, filed with the rest of the card by whoever holds `emergency-card.write`,
versioned and audited like every other field. A number is digits and spaces with an optional
leading plus, three to twenty characters, so the phone can dial it as written.

- A card that names nobody reads exactly as before: "Read to 999", "After 999", **Call 999**.
- A card that names someone reads to them: the red block is headed "Read to Estates
  Security", the duty manager comes "After Estates Security", and **Call Estates
  Security** is the first action pinned under the thumb.
- **Call 999 stays on the screen for every venue**, beneath any first call, so a security line
  that does not answer never leaves a volunteer without a way to reach the emergency services.
  On a night with several venues, each distinct first call is offered once, by number, in the
  order the cards come, and 999 comes last.
- **No emergency call dials on the first tap.** Each opens a sheet naming who and the number;
  only the sheet's own button, which carries the number, is the telephone link. The duty managers' numbers on the card
  are not emergency calls and still dial directly.

## Consequences

- The committee sets the first call on each campus venue's card from the console. Until it does,
  those venues still say 999, which is what they said before.
- The number sits on each card rather than once in configuration, so a change to the security
  line is one edit per campus venue. There are four.
- The cached card carries the first call with it, so it works with no signal like the rest.
- The confirmation costs one extra tap on every emergency call. That tap is the point.
- The migration adds two nullable columns to an append-only table and rewrites nothing (0010).

## Options considered

- **A campus flag on `venues` and one estates security number in configuration.** Refused: the
  number is not a policy number (0012) and has no proposed value to ship, so it would ship unset
  and change nothing until configured; a flag also says only "campus", when the real question is
  who to ring, which an external venue with its own security desk could want too.
- **Deriving campus from the linked room.** Refused: most venues have no room, and `rooms.campus`
  is a place name, not a procedure.
- **Replacing 999 outright at a campus venue.** Refused: the report asked for security first, and
  removing the only emergency-services action from the one screen built for the worst moment of
  the night is not a trade worth making.
