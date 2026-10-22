# 0160: A till close names its bar, and a second session tonight is asked for

- Status: Proposed
- Date: 2026-10-21
- Amends: how the till met F-102 criteria 1 and 2 and F-118 criterion 3 on screen

## Context

On the hands-on review of 21 October 2026, the Front of House Manager meant to close the till at
one bar and closed the live till at another. The phone had remembered the other bar in its cookie,
and nothing on the till or in the close dialogue named the bar: the title read "Close till" and the
header "Open since 21:03". A £1.50 Z was recorded against £247.35 expected, on a session that cannot
be edited after.

Two more things made it worse. After **Confirm close** the grid stayed on screen with "Open since"
until a reload (issue 1580), so the close looked as if it had not happened. And pressing **Open
till** after a close quietly started a second session for the same bar and night, while the screen
said "The till is not open yet" as if nothing had happened that evening.

## Decision

- **The till names its bar.** The header reads "Open at New Theatre since 21:03", and the close
  dialogue is titled "Close the till at New Theatre". `GET /api/till` returns the venue's name.
- **A close is shown as a close.** The grid goes as soon as the close is recorded, and the screen
  says "The till at New Theatre closed at 21:30, by …, with a Z of £…". `GET /api/till` returns
  this bar's latest close tonight (`lastClosed`), so a reload says the same.
- **A second session tonight is asked for.** `POST /api/till` refuses with 409, naming the bar and
  when it closed, when this bar has no open session but closed one tonight, unless the body says
  `reopen: true`. The till sends that only after a confirmation that says a second session needs
  its own close and its own Z. Joining a session that is already open asks nothing.
- **The loser of two closes is told whose reading stands** (issue 1581): who closed it, when, and
  with what Z, whether the first read or the write caught them.
- The dialogue says the reader figure is the whole night's, so a bar closed while another serves
  will be under and should say so in the note.

## Consequences

- A phone that remembered the wrong bar is caught by reading the title, before a Z is typed.
- A second session is still possible, as the partial unique index always allowed, but never by a
  single press. The rule is in the route, so a script or a stale screen is refused the same way.
- The end-to-end cases skipped for issues 1580 and 1581 run again.
- Reconciliation's handling of one bar's close replacing another's reading is the money side's,
  and is not changed here.
