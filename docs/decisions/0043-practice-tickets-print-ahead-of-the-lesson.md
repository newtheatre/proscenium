# ADR-0043: Practice tickets are printed ahead of the lesson, and every card says so

**Status:** Accepted · **Date:** 2026-08-25 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

The door sandbox ([14-training-mode §5.3](../14-training-mode-design.md)) teaches scanning, and until
now there was nothing to scan. The fixture bookings `TRAIN1` to `TRAIN5` existed only as data, so a
lesson meant putting a reference on a second screen and pointing a camera at it, or typing it in and
skipping the scan entirely, which is the half of the job people actually get wrong.

A trainer prepares before a lesson. On the afternoon they are photocopying, nobody has a practice
window open and no run has been started, so anything that asks the training system whether practice is
open is useless to them at exactly the moment they need it.

Printed QR codes also leave the building. A loose card in a foyer must never be picked up by a
volunteer on a real door and treated as a ticket.

## Decision

**A page, `/foh/practice-tickets`, guarded by the `foh` middleware and nothing else.** No shift, no
show, no practice window, no run. This follows the rule training mode already set: a sandbox is
reachable on a Tuesday afternoon in a library, and the rota scopes access to *tonight's real
customers*, of which there are none here ([14-training-mode §2](../14-training-mode-design.md),
[ADR-0019](0019-the-rota-scopes-the-front-of-house-role.md)). Holding `foh.work` is the same bar as
the Practice tile on the FOH home, and the sheet contains nothing a person with that role cannot
already read in the repository.

**The QR encodes the bare booking reference, `TRAIN1`, not the URL a real ticket carries.** A real
ticket's QR is `<baseURL>/t/<ref>?t=<signed token>` (`server/utils/email.ts`), and the scanner accepts
either that or a bare reference, taking the six characters and matching on them
(`refFrom` in `app/pages/foh/scan.vue`). The bare reference is the string the scanner actually matches
on, so it is what the card carries. Three things follow from it, all of them wanted:

- a practice card resolves to nothing. Pointed at an ordinary phone camera it offers no link to
  follow, because it is not a URL;
- it fits a version 1 QR, so the printed modules are as large as the card allows;
- there is no token on it to look valid, expire or be reasoned about.

**Every card carries the warning, not just the sheet.** The sheet is cut up, so its heading is
discarded with the offcuts. Each card says `PRACTICE TICKET`, `Not a real booking. Not valid for
entry.`, and carries a footer naming it as a door training sample. The border is a dashed cut line,
the text is black on white, and none of it depends on a background colour printing.

**A practice reference cannot collide with a real one.** `bookingRefId` draws from
`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (`server/db/schema/reservation.ts`), which excludes `I`, `O`, `0`,
`1` and `L` so nobody misreads one. Every `TRAINn` contains an `I`, so no generated reference can ever
equal one. A practice card scanned on a real door is a reference that cannot exist, on a lookup that
is scoped to tonight's performances anyway: it finds nothing, twice over.

**The codes are generated with `uqr`, which is already a dependency**, and rendered as SVG paths in the
page. No new package. `server/utils/qr.ts` wraps the same library into a 1-bit PNG for the
confirmation email, because email clients will not render an SVG; paper has the opposite requirement,
so the page draws vectors and the printer rasterises them at its own resolution.

**The print rules live in the page**, as a `@media print` block and Tailwind `print:` variants. There
is no global print stylesheet in this app and this feature is not a reason to start one.

**`bookingStanding` moved to `shared/utils/bookingStanding.ts`** so the card and the door compute the
verdict with the same function. Every card's lesson (green, amber, red, the party size, the amount
owed) is derived from the fixture through it, so a card cannot print an outcome the scanner disagrees
with. `server/utils/reservationLifecycle.ts` keeps the lifecycle guards and no longer holds the rule.

## Alternatives considered

- **Gate the sheet behind an open practice window or a live run.** Rejected: it is the one thing the
  request rules out. A trainer prints before a lesson, when rehearsal has opened nothing.
- **Encode the `/t/<ref>?t=` URL a real ticket carries.** Rejected. It is the shape most easily
  mistaken for a real ticket, it invites a phone camera to open the real site, and the token on it
  would be either absent (so the link fails) or fabricated (so the card carries a credential-shaped
  string that means nothing).
- **A server route rendering the sheet, as a PDF or as PNGs.** Rejected. Nothing in the Worker renders
  a PDF, the browser already paginates better than we would, and a sheet endpoint under `/api/foh/**`
  would be refused by `server/middleware/trainingMode.ts` while a run is open, which is exactly the
  person most likely to reload it.
- **Add a QR library (`qrcode`, `qrcode-generator`).** Rejected: `uqr` is here, is MIT, is maintained
  in the unjs organisation, has no dependencies and already generates the QR on every confirmation
  email. A second generator would be a second answer to the same question.
- **A tile or link on the FOH home.** Rejected for now. Training mode leaves no hint that it exists
  when nobody has a window open ([14-training-mode §3.1](../14-training-mode-design.md)), and a
  permanent link on the show night screen would break that and add a seventh thing to a screen whose
  design is six. The URL is in the runbook instead, which is where a trainer preparing a lesson is
  already looking.

## Consequences

Good: a lesson can be prepared in advance with a printer and scissors, and the thing a trainee scans
is the thing the scanner reads, proven by decoding the rendered codes with `jsqr`, the same library
the scanner falls back to. The cards teach on their own: whoever picks one up knows which case it is
without a key sheet. Nothing new is installed, and nothing new is served: the page has no API call, so
it works with rehearsal down.

Bad: the sheet is reachable by anybody holding `foh.work`, which is a wider audience than the trainers
who want it. The mitigation is that there is nothing on it to protect.

Bad: `@page { size: A4; margin: 10mm }` is a document-level rule, so it is not scoped to the page the
way the rest of the styles are. Once this page has been visited, printing another screen in the same
browser session inherits A4 and a 10mm margin. Nothing else in the app is built to be printed, so the
cost of that is theoretical, and the alternative is a global stylesheet this feature does not justify.

Bad: two cards teach the same lesson. The fixture's `TRAIN2` is described as an already-admitted
rescan, but the door screen has no admit action and the fixture has no admitted-at field, so `TRAIN2`
and `TRAIN4` are the same paid booking with different names. The sheet does not invent a difference:
it says on the page that a rescan is practised by scanning the same card twice, which is what the
lesson actually is. Giving the fixture a distinguishable admitted state is a change to the scenario
and to the door screen, and belongs with whoever adds a second scenario.
