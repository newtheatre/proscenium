# 0069: The SumUp app takes the amount by hand-off, and the till records only a reported outcome

- Status: Proposed
- Date: 2026-09-14
- Supersedes: the "no reader integration is built" clause of 0005. Everything else in 0005 stands.
- Superseded in part by 0096: the typed path is an attempt too, answered by the person at the reader.

## Context

0005 fixed payment on the SU's physical SumUp reader and, after SP-1, recorded that the reader
cannot be driven by the system: the SU's merchant account does not grant the society developer
toolkit access, so the reader API and the terminal SDK were resolved as won't-build (D-205,
F-201). The till has therefore shown one figure for a human to key into the reader, and the
reconciliation has caught the £45.00 keyed for a £4.50 round the next morning.

SumUp offers a third path that SP-1 did not ask about. **Payment Switch** is an app-to-app link:
`sumupmerchant://pay/1.0?...` opens the SumUp app already signed in on the volunteer's phone, with
the amount, a title and a foreign transaction id filled in, and the app returns to a URL of ours
with the outcome (`smp-status`, `smp-tx-code`). It needs an affiliate key, generated from the
merchant dashboard by whoever holds the SU's SumUp login; it needs no developer toolkit, no SDK
and no API credential. The reader is still the SU's reader, paired to the SU's app, taking the
payment the way it always has. What changes is who types the figure.

Two things about the return leg matter. First, the callback is unsigned: whoever holds the URL
can fabricate a success. Second, it may arrive in a different browser from the one the till was
open in, or never arrive at all (the app closed, the reader lost signal, the phone died).

## Decision

The till hands the amount to the SumUp app by Payment Switch when an affiliate key is configured
and the device is a handheld. The typed cross-check remains the flow on the counter laptop and
the fallback everywhere (F-104 is unchanged).

Every hand-off is a row in `sumup_attempts`, holding the basket exactly as priced and the total
the app was asked for. **Nothing posts to the ledger and no booking is collected until the app
reports success or a member of bar staff explicitly resolves the attempt as paid.** A reported
success re-runs the whole cross-check against the database as it then stands and posts the sale
through the same `commitSale` the typed path uses; a basket that can no longer be sold marks the
attempt mismatched with the reason and writes nothing, because the reader now holds money the
ledger cannot explain, and that is a fact for a person to resolve rather than a row to force.

The outcome is accepted from a browser holding no session when it carries the attempt's signed
key (in the return URL's path, so the app's own query string cannot collide with ours), and from
anyone holding bar authority tonight otherwise. It is a claim, exactly as trustworthy as the tap
on "charged" the typed flow has always trusted, bound to an attempt a bar-authorised person
started, and the transaction code it carries is stored so a fabricated one is visible at
reconciliation against the SumUp dashboard.

Every transition of an attempt is a conditional write with the predicate on the statement
(0001, 0003): a callback and a staff resolution cannot both land, and a second delivery of the
same callback answers with the state it finds rather than posting twice.

## Consequences

- 0005's boundary holds: no online charge, no card data, no PCI scope, no webhook, no settlement
  feed. The daily Z reconciliation is unchanged and gains a line for tickets taken at the bar.
- The affiliate key and the application id are worker secrets (`NUXT_SUMUP_AFFILIATE_KEY`,
  `NUXT_SUMUP_APP_ID`), nested under `sumup` in runtime config so an installation that has not
  set them is not nagged on every isolate start; the till reads as before until both are set.
- iOS documents only custom URL schemes for the return leg. An `https` return is documented for
  Android's mobile web case and is what this builds; whether the SumUp app on iOS opens it in
  Safari is recorded as unverified in `docs/known-issues.md` until a real handset has tried it.
  The keyed, session-less return route exists for exactly that case.
- An unanswered attempt is abandoned by a sweep after `SUMUP_ATTEMPT_TIMEOUT_MINUTES`; a stuck
  completion is marked mismatched after ten minutes; the till refuses to close while any attempt
  is still open. A ticket line inside an open attempt cannot be charged again by hand.
- D-205 and F-201 stay withdrawn for the reader API and SDK, with a note pointing here.

## Options considered

- **Keep the typed figure as the only flow.** Rejected: the mis-keyed figure is the one
  recurring reconciliation variance, and this removes it on every phone at no cost to the
  boundary 0005 exists to hold.
- **The reader API or terminal SDK.** Rejected: SP-1 was refused the toolkit, and nothing about
  that has changed. Payment Switch is the SumUp app, not our code driving the reader.
- **Post the sale when the app is opened, void on failure.** Rejected: a phone that dies
  mid-charge leaves a paid booking with no money behind it, and the only void path this ledger
  has is for a tab charge (F-109). The sale is written when the money is reported, not before.
- **Trust the callback and nothing else.** Rejected: it is unsigned. Binding it to an attempt a
  bar-authorised person started, and to a signed key of ours, is what makes it as good as the
  tap it replaces and no better.
