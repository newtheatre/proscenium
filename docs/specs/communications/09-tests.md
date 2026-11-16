# 8. Tests

Named cases, filed under the tier of the foundations test harness that runs them: unit (pure functions), integration (workerd with a local D1), end-to-end (Playwright against the built Worker), and the proofs to run before the build starts.

A case or proof marked "later" belongs to the release that adds mailings, or to the later story it names, and is written then. Every other case is run for the first release: lists, consent, sign-up, unsubscribing, notices and the export.

## Proof before build

| Proof | Question | Pass | State |
| --- | --- | --- | --- |
| P-COM-1 A tranche as one set | Can one unit of work pass a tranche of recipients to core as one set, with the recipient updates and the audit entry, inside D1's batch limits and `core.units.set-rows-limit`? | The default tranche of 50 commits in one batch on local and deployed D1; the largest size that does is recorded as the ceiling for `tranche-size` | To run with core, before the build |
| P-COM-2 Ten thousand | Does a 10,000-recipient mailing prepare and hand over within the bulk lane's limits without starving the prompt lane? | A ticket email queued mid-campaign is sent within its usual time | Later, with mailings |
| P-COM-3 Provider feedback | What does Cloudflare's email sending report back for a bounce and a complaint? | The event is received, and its message id matches the one `send()` returned | Bounce half passed on 16 November 2026, run by the core domain build: the ids match exactly and the event arrives in under a second. Cloudflare did not suppress the address itself within four and a half minutes, so core's own suppression is what stops a repeat. The complaint half will not be run (Matt, 16 November 2026): the complaint path is built to Cloudflare's documentation and stays unproved |

## Unit

| Case | Checks |
| --- | --- |
| consent-basis-guard | An open audience list can only be consent-based |
| double-opt-in-applies | True for public and signed-out sources, false for signed-in ones; the list override wins over the setting |
| subscription-moves | Every allowed move is accepted and every other is refused, by table |
| campaign-moves | The same for the campaign state table |
| content-checks | Unknown block, unknown merge field, missing alt text and missing subject are each caught |
| notice-refuses-promotion | A promotional block fails a notice. Later: and passes a mailing |
| merge-field-fallback | `first_name` renders the fallback for an account with no name |
| quiet-hours (later) | A start time inside quiet hours is deferred to the end; equal values disable; a notice is never deferred |
| throttle-delays (later) | Tranches are spaced so no minute exceeds `per-minute` |
| audience-algebra (later) | List, include and exclude combine as intersection and difference |
| merge-resolution | The stricter state wins: unsubscribed beats everything, subscribed beats pending, and the result is the same whichever account survives |
| token-shape | Confirm and preferences tokens are random, stored hashed with an expiry, and work once. A manage token is signed for its one purpose, holds ids and an expiry only, and is refused for any other purpose or after its expiry. No address carries a bare row id, and a wrong, used or expired link of any kind gets the same answer |

## Integration

| Case | Checks |
| --- | --- |
| signup-is-silent | The sign-up route returns the same body and timing class for a new, a subscribed and an unsubscribed address |
| signup-one-unit | Pending subscription, consent record and notification commit together or not at all, and no account is created |
| confirm-once | A confirm token passes the guard once; on a second use the guard fails and nothing is written |
| confirm-expiry | The daily task deletes an expired pending row and writes an expired record |
| consent-append-only | Update and delete on consent records fail by trigger; the erasure update alone succeeds |
| every-move-records | Each subscription move leaves exactly one consent record |
| get-never-unsubscribes | A GET of the manage link changes nothing |
| one-click-post (later) | A POST with only the token unsubscribes and needs no cookie |
| unsubscribe-beats-tranche (later) | Someone who leaves after the snapshot and before their tranche is excluded with reason left-list |
| topic-off-excludes (later) | A person with the topic off is excluded at snapshot; core would also suppress the delivery |
| snapshot-fixed | Someone who joins after the snapshot does not receive the campaign |
| tranche-idempotent | Running the same tranche job twice creates each notification once |
| start-claimed-once | Two runs of the start task cannot both start a campaign: the guard passes for the first and fails for the second |
| dead-tranche-requeued | A tranche whose job died is re-queued by the sweep and finishes |
| pause-and-cancel (later) | Pause stops new tranches; cancel excludes all pending; a tranche in flight completes |
| results-outlive-log | Final counts are on the campaign after core's deliveries are purged |
| unreachable-counted | An unreachable account is excluded and counted, and no address is revealed. A person subscribed both by account and by a verified address is sent one copy |
| side-never-crossed | A campaign on one side cannot name a list or a source of the other side |
| notice-needs-flag | A source without `notices: true` cannot receive a notice |
| notice-two-abilities | A notice needs this module's ability and the source's own |
| staff-cannot-resubscribe | The service refuses to move an audience subscription from unsubscribed to subscribed for a staff actor |
| read-is-audited | Loading subscribers or recipients writes a read audit entry naming the list |
| scoped-grant | A grant on one list shows that list's subscribers and campaigns and no other |
| erasure | Subscriptions gone, account cleared from records and recipients, counts unchanged |
| merge | The handler step settles every shared list by the unit rules before the move, setting the other row aside with one merge consent record per list, so the move never meets the unique rule; a merge with the step left out fails on that rule; running either stage twice changes nothing more; every other account column is left as an alias and is still found through the account scope. Undone: each set-aside row returns to its account, an unsubscribe carried across or made since stands on both, no consent record is removed, the count of what stood is returned, and a second undo changes nothing. A set-aside row is deleted once the undo window has closed |
| download | The export contributor returns the person's subscriptions and consent history |
| import-keeps-unsubscribes (later) | An imported address already unsubscribed stays unsubscribed |
| checkout-consent-once (later) | The record contribution returns statements only, subscribes once for an order, and a throw fails the checkout |
| module-off | No campaign starts, routes answer not found, data remains |
| source-module-off | A campaign using a missing source fails the content checks and stays in draft |
| events-carry-no-person | No announced payload holds an address, a name or free text; the subscription event is internal |
| export-carries-evidence | An exported file holds, for each subscribed row and no other, the address, the source, the date, the wording version and the manage link, and the export writes a read audit entry |

## End to end

| Case | Journey |
| --- | --- |
| join-confirm-leave | A visitor joins from the footer, follows the link from the captured email, then leaves from the manage link |
| write-and-send (later) | A marketing lead writes a mailing, sends a test, sends to a list of three, and sees the results |
| member-and-audience | One account with both sides sees separate lists in each shell and can join and leave each. Later: each mailing arrives at the right address |
| notice-from-performance | A duty manager sends a notice from a performance's Messages tab to its ticket holders, including a guest |
| counts-not-names | A member of staff without the subscriber ability sees counts and the hidden-names explanation on a notice's Recipients tab |
| accessibility | Every console screen and the three public pages pass the interface specification's automated accessibility checks, keyboard only |

## What is deliberately not tested here

Delivery, retries, bounce handling and the suppression list are core's and are tested there. This module's tests stop at the notification row.
