# 0101: Tonight's duty manager may message tonight's audience

- Status: Accepted (IT Manager, 26 September 2026)
- Date: 2026-09-26
- Extends: 0089, 0044

## Context

The announce composer (H-108) is the only way to write to the people coming to a show, and only
`comms.announce` opens it, which only the IT Manager holds. On a show night the person who needs
to tell the house something (the doors are late, the car park is shut, the second half is
cancelled) is tonight's duty manager, standing in the foyer. The MVP flow review of 25 September
2026 (issue 1327) found them, and the Front of House Manager, refused at `/comms/announce` in the
public shell, with no messaging tile on `/tonight`. It also found a plain message to ticket
holders joining the bookings digest, up to an hour later, and skipping anybody who had muted
Bookings unless the composer's safety tick was set; the screen said so only after sending.

## Decision

**Tonight's confirmed duty manager may message tonight's ticket holders and tonight's rota.**
The composer is a show-night screen, `/tonight/message`, reached from a hub tile, and every route
behind it is guarded by `requireNightAuthority(event, 'DUTY_MANAGER', { performanceId })`:

- The authority is the shift, inside its window (0009, 0078), never a standing grant. The Front of
  House Manager reaches the screen through the existing officer bypass, recorded once per night,
  venue and role when it sends (0044, 0098).
- The audience is fixed to one of tonight's performances that the caller's authority covers: its
  ticket holders, resolved by the announce composer's own resolver (0089), or its rota, the
  claimed and confirmed slots on that performance. No other audience is offered, so this is not a
  second route to the membership or to another night's house.
- Every message sends at once, as the transactional types the composer already has:
  `admin.ticket-holders.safety-notice` for ticket holders and `admin.safety-notice` for the rota.
  A message about tonight that waits for the next digest has missed the night it was about, and a
  booker's Bookings preference was never meant to keep them from hearing that tonight has moved.
- The screen shows the count before a word is written, a preview, and a send that names the
  count. The send is recorded as `comms.announcement.sent`, the composer's own action, with the
  performance, the audience, the count and whether a shift or an officer sent it; the subject and
  the message stay out of the audit trail (0011), in the send log where they already are.

`/comms/announce` also says when a message goes before it goes. The safety tick becomes a choice
between sending now and sending with the recipient's other messages inside the digest window,
read live from configuration (0012), and a performance on tonight's show night starts on send now.

## Consequences

- A duty manager can reach a whole house, guests at unverified addresses included, from a phone.
  That reach is the one 0089 already gave the composer, bounded the same way: a live booking for
  a performance on tonight's show night or later, and here tonight's alone.
- Nothing extra is recorded for a shift holder: sending is their job. An officer's send is flagged
  on the night report as any act of theirs is.
- Every message sent from the show-night screen ignores preferences. That is the point of it, and
  also why the audience is fixed: the choice of transactional type is safe only because nobody can
  point it at the membership from here.
- The announce composer keeps its audiences and its two types; only the wording of the choice and
  its starting point for tonight's performance change.

## Options considered

- **Give the duty manager role `comms.announce`.** Lost: it is a standing grant, not a fact about
  tonight (0009), and it would open every audience, the whole membership included, for the year.
- **Let tonight's messages choose between now and the digest, as the composer does.** Lost: the
  choice exists for news that can wait, and nothing sent from the foyer on the night can.
- **A new message type for tonight's messages.** Lost for now: the transactional pair already
  carries the right sender and reach, and a third type would need its own place on "What the
  theatre sends" to say the same thing.
