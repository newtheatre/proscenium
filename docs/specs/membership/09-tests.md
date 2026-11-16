# 8. Tests

Named cases in the three tiers of the Foundations harness: unit (pure functions), integration (workerd with a local D1, real batches) and end to end (Playwright against the built Worker). Eighteen cases are marked never-regress: they guard the invariants of tab 3 and run on every pull request.

## Unit

Pure functions with the clock injected. No database.

| Case | Checks |
| --- | --- |
| `dates-fixed-before-end` | Fixed-date scheme ending 31 July, start 10 October 2026: ends 31 July 2027 |
| `dates-fixed-on-end-day` | Start on 31 July with no rollover: ends that same day |
| `dates-fixed-rollover` | 60 rollover days, start 20 June 2027: ends 31 July 2028. Start 1 June 2027 (exactly 60 days before): ends 31 July 2028. Start 31 May 2027: ends 31 July 2027 |
| `dates-rolling-month-end` | 12 months from 31 January ends 30 January; 1 month from 31 January ends on the last day of February, in a leap year and not |
| `dates-indefinite` | End date is null |
| `dates-renewal-contiguous` | A renewal made in the window starts the day after the earlier end, by each length rule |
| `dates-renewal-after-lapse` | A renewal after grace starts today |
| `status-derivation` | Upcoming, current, in grace and lapsed for dates either side of each boundary, with grace 0 and 14 |
| `status-local-date` | At 23:30 UTC on 31 July in Europe/London (00:30 on 1 August locally) a membership ending 31 July has lapsed; at 22:30 UTC it is current |
| `renewal-window` | Opens on the right day; closed for an indefinite membership; closed when `renewal_opens_days` is 0 |
| `scheme-state-transitions` | Every allowed and refused transition of a scheme |
| `membership-state-transitions` | Every allowed and refused transition of a membership; terminal states are never left |
| `scheme-validation` | 29 February refused; fixed fields required exactly when the rule is fixed; side locked when memberships exist |
| `list-key-normalising` | Addresses are trimmed and lower-cased before hashing; a reference keeps its case-insensitive form; blank and malformed rows are rejected and counted |
| `reference-format` | `membership:<scheme id>` and `membership:any` parse; anything else is refused |
| `price-in-force` | The latest from-date not after today wins; a renewal price is used for a renewal and falls back to the joint price |
| `reminder-due` | Which reminder, if any, is due for a membership on a date, given `last_reminder` |

## Integration

Real units of work against local D1. Each case states what must be in the database afterwards.

### Joining and activation

| Case | Checks | Never regress |
| --- | --- | --- |
| `join-free-unchecked-one-request` | One request leaves an active membership, a member row with a number, an audit entry and a `started` event, and nothing pending |  |
| `join-writes-all-or-nothing` | With the form response made to refuse (a one-each placement already used), no membership, charge, verification or event row exists |  |
| `activation-needs-every-requirement` | For every combination of the three requirements, the membership is active exactly when all needed timestamps are set; the check constraint refuses a forced update (I1) | Yes |
| `activation-twice` | `markPaid` and `markVerified` raced as two batches activate once; the second finds that the guard did not pass and refuses cleanly |  |
| `one-open-application` | A second application for the same scheme returns the first (J3) |  |
| `join-refused-when-current` | Outside the renewal window the refusal carries the date renewal opens |  |
| `payment-not-offered-before-checks` | A charge cannot be paid while verification or approval is unmet (A2) |  |
| `application-expires-only-on-applicant` | The sweep expires an application waiting on the applicant and leaves one waiting on staff (J5) |  |
| `member-number-unique-under-race` | Twenty first activations at once give twenty distinct numbers (I7) | Yes |
| `no-account-created` | Across every route of both modules, the count of accounts changes only in the staff add-by-address case, and no sign-in row is ever written (I6) | Yes |

### The standing and benefits

| Case | Checks | Never regress |
| --- | --- | --- |
| `holder-fact-current-only` | `membership.holder` is false for pending, declined, expired, ended, upcoming and lapsed memberships and true for current and in-grace ones (I4) | Yes |
| `supporter-never-standing` | A supporters' scheme makes `membership.supporter` true, `membership.holder` false and `core.member` false (I3) | Yes |
| `describe-viewer-without-standing` | For a person whose only membership is pending, lapsed or a supporter's, `describeViewer` and every page response contain no members' navigation entry, address or count (I2) | Yes |
| `lapse-needs-no-task` | With every scheduled task disabled, advancing the clock past the end of grace makes `core.member` false | Yes |
| `audience-side-unchanged-by-ending` | Ending a membership leaves the account's orders, tickets and form responses byte for byte the same | Yes |
| `scheme-holder-fact` | True only for the scheme held; two current memberships of one scheme count once (D4) |  |
| `voter-qualifying-period` | False until the period has passed since activation; false for a scheme not marked voting |  |
| `requirement-met-and-until` | `membership:<scheme id>` and `membership:any` answer met with the right `until`; a different scheme answers not-met with its reason |  |
| `requirement-no-account` | An order with no account and nothing presented is not-met |  |
| `requirement-module-off` | With `membership` off the kit answers unavailable and the source is not called |  |
| `requirement-at-instant` | A membership ending today is met for `at` today and not-met for `at` tomorrow |  |

### Verification

| Case | Checks | Never regress |
| --- | --- | --- |
| `email-domain-verified-only` | An unverified address at the domain does not pass; a verified one does |  |
| `email-verified-later-completes` | Verifying the address afterwards passes the open application through the listener, once, even when the event is delivered twice |  |
| `list-match-verified-address` | Only a verified address matches an `email` list |  |
| `list-reference-spent-once` | Two applicants with one reference: the first passes, the second is `needs-staff` with `entry-already-used` |  |
| `list-not-readable` | No route returns an entry's reference or address, the stored column never equals the uploaded value, and the uploaded file is gone after the job (I9) | Yes |
| `list-reload-replaces` | A second upload replaces the entries set-wise; a failed job leaves the old entries |  |
| `list-expired-matches-nothing` | Past `valid_until` the verifier fails and the sweep deletes the entries |  |
| `verify-own-refused` | A membership officer cannot pass their own application |  |
| `verifier-module-off` | A scheme whose verifier's module is off leaves applications as `needs-staff` and raises the health check |  |

### Renewal and ending

| Case | Checks |
| --- | --- |
| `renew-once` | Two renew requests leave one renewal (R3) |
| `renew-archived-refused`, `renew-closed-allowed` | Rule R6 |
| `reminders-once` | The task run three times on one day sends each due reminder once; a renewed holder gets none |
| `lapse-announced-once` | The lapse event exists once per membership however often the task runs |
| `end-guarded` | Ending an ended membership refuses; ending writes the reason, actor and audit entry |
| `end-by-holder-own-only` | A holder ends their own and is refused another's with not found |

### Fees

| Case | Checks | Never regress |
| --- | --- | --- |
| `settle-is-atomic` | A successful attempt leaves the charge paid, one balanced posting to `membership-fees.income` and an active membership; with the posting made to refuse (closed period resolved, then a forced failure) none of the three exists (I5) | Yes |
| `settle-twice` | A webhook and a poll answering the same attempt settle once |  |
| `settle-entries-total-part` | The entries the handler returns total the fees module's part of the payment and go only to its own accounts, and the posting Payments writes is marked for\_module membership-fees; with the handler made to post short, or to another module's account, Payments records the provider's answer, nothing settles, the intent is unfulfilled and refunded, and no membership is active (P4) |  |
| `release-twice` | The settlement handler's release(unit, part) lets go of a charge prepared at the desk; a second call changes nothing; the desk panel offers no release of its own (P4, P8) |  |
| `no-period-close-blocker` | The fees module contributes nothing to finance.period-close-check, and after any scripted run no paid charge lacks its posting (P4, I5) |  |
| `cannot-settle-after-expiry` | Payment for an expired application is marked unfulfilled and no membership exists |  |
| `one-charge-per-membership` | The unique index refuses a second live charge |  |
| `price-change-does-not-move-charge` | A charge made before a price change is still for the old amount |  |
| `full-refund-ends-membership` | The posting is reversed and the membership ends as `refunded`; with the setting off it stays active |  |
| `part-refund-keeps-membership` | The charge is `part-refunded` and the membership runs on |  |
| `waiver-audited-and-not-own` | A waiver voids the charge, meets the requirement, writes the reason, and is refused on one's own membership |  |
| `fees-off-blocks-paid-schemes` | With the fees module off, applying to a scheme that requires payment is refused and never yields an active membership (S5) | Yes |
| `ledger-reconciles` | After a scripted month of joins, renewals, waivers and refunds, the income account's balance equals paid charges less refunds |  |

### Platform duties

| Case | Checks | Never regress |
| --- | --- | --- |
| `merge-moves-memberships` | Rule X2 in each of its three cases; running the merge's stages twice changes nothing more; with the move not yet run, the holder fact and the requirement answer for the survivor already count the loser's membership through the account scope; two active memberships of one scheme count once and each keeps its evidence; actor columns still read as the survivor; undo restores both accounts |  |
| `claim-keeps-membership` | A membership added to an unclaimed account is the claimed person's on first sign-in, with no row changed |  |
| `erasure-walk` | The Foundations walking erasure test over all nine tables: live memberships end as `erased`, notes are redacted, numbers remain, no personal value survives |  |
| `events-ids-only-and-internal` | Every event of both modules carries ids only, and every membership and charge event is internal, checked against the data-class registry (I8) | Yes |
| `module-off-and-on` | Switching `membership` off makes its facts false and its routes not found; switching it on restores every current membership with no job run |  |
| `routes-declare-abilities` | Every route of both modules declares its ability or its public or signed-in status, its rate limit, and idempotency where it writes |  |
| `someone-elses-membership-not-found` | Any address or route for another person's membership answers not found, never a refusal |  |

## End to end

Playwright, against the built Worker with seeded data. Each is one journey of tab 5.

| Case | Journey |
| --- | --- |
| `guest-buyer-becomes-member` | A person who bought a ticket as a guest signs in with that address, joins a free members' scheme, sees the members' entry appear, and still sees their ticket under My account. One account exists at the end. Never regress |
| `supporter-sees-no-members-area` | A person joins a supporters' scheme; the header has no members' entry and a members' address shows not found. Never regress |
| `join-with-form-check-and-payment` | Form, email-domain check with an address added on the way, payment with the test provider, done page with the card |
| `staff-check-queue` | An application waits; a membership officer passes it; the applicant's page moves on |
| `lapsed-member-renews` | With the clock moved past the end, the members' entry is gone, My membership offers Renew, and renewing brings the entry back |
| `add-member-by-address` | Staff add a person by name and address; that person later signs in and finds the membership and the members' area |
| `member-price-at-checkout` | With Box office on: a member is offered the member ticket type, a non-member is not, and a signed-out visitor sees the theatre's chosen wording |
| `scheme-lifecycle` | Create, configure, open (with a missing item reported), close with the impact line, archive |
| `accessibility-pass` | My membership, the join steps and the Members list pass the Interface conventions' automated accessibility checks and are usable by keyboard alone |

## What is not tested here

| Left to | What |
| --- | --- |
| Identity | That a fact marked as a standing opens the members' area, and that non-members get not found at members' addresses |
| Form builder | Rendering, validation and review stages of the application form |
| Payments and Finance | Providers, attempts, refund approval, the balance of the ledger as a whole |
| Box office | What a ticket type does with met, not-met and unavailable; the presented-value field; the limit per holder; the check at entry and the door page |

Membership's cases use those modules for real in the integration tier, with the test payment provider, and assert only Membership's own rows and facts.

## Length options, list entries and presented references

The four marked never-regress guard invariants I9 and I10.

| Level | Case | Proves |
| --- | --- | --- |
| Unit | `option-fixed-three-years`: a fixed scheme's option of 3 scheme years ends on the third year end | D8, with the rollover case either side of the boundary |
| Unit | `option-rolling-36-months`: ends the day before the anniversary | D8 |
| Unit | `option-single-asks-nothing`: a scheme with one option asks nothing and a scheme with none cannot open | D8, S4 |
| Unit | `price-for-option-wins`: a price for the chosen option wins over a price for every length | P1 |
| Unit | `reference-label-required`: a reference list without a label phrase is refused | V13 |
| Integration | `entry-end-date-sets-membership-end` | D9 |
| Integration | `staff-change-option-before-pass`: both the chosen and the changed option are audited | D10 |
| Integration | `entry-ended-matches-nothing`, typed or presented | V10, MEM-57 |
| Integration | `entry-added-by-hand-verifies` | V19 |
| Integration | `list-check-one-entry`: checking a reference answers yes or no, until when and in whose name, records a read, and returns no list | V19, I9 |
| Integration | `list-reimport-keeps-ids`: entries whose reference is unchanged keep their ids, and names are replaced | V11, V18 |
| Integration | `holder-end-forbidden-by-scheme`: the route refuses, not only the button | `holder_may_end` |
| Integration | `presented-entry-met`: a reference on the list answers met with evidence, until and a summary | V8, V10 |
| Integration | `presented-member-number-met`: a current holder's member number answers met; a lapsed holder's does not | V8 |
| Integration | `evidence-answers-later`: an evidence id answers met later and not met after the entry or membership ends | V11 |
| Integration | `evidence-same-by-both-routes`: the account check and the typed reference of one membership return one evidence, before and after the entry is claimed | V11 |
| Integration | `signed-in-holder-not-asked`: met by account without presenting anything | V12 |
| Integration | `miss-gives-nothing-away`: a well-formed miss returns the help link and reads the same for a value that exists on another list; a malformed one returns the shape; no answer carries a name | V15 |
| Integration | `check-ability-for-others`: a check about another account without `membership.card.check` answers not met and Membership is not called | tab 4 |
| Integration | `name-erased-after-setting`: the sweep clears `holder_name` after `membership.verification.names-keep-for` | V18 |
| Integration, never regress | `holder-name-staff-only`: `holder(evidence)` returns a name only through the kit with `membership.verification-list.check`, records the read without the name, and the name is in no answer, summary, event or job | V18, I9 |
| Integration, never regress | `presented-creates-nothing`: no account, membership, number or standing | I10 |
| Integration, never regress | `presented-value-not-kept`: the typed value is in no table, log line, audit entry, event or job | I10 |
| Integration, never regress | `reference-off-never-met`: a scheme without `accepts_reference` never answers met for a presented value | V8 |
| End to end | `member-ticket-by-student-id`: a buyer with no membership account buys a member ticket with a student ID, and a second for a friend with the friend's | MEM-58, V14, with Box office |
| End to end | `reference-buyer-later-joins`: the same person joins, is verified at once, and the members' area appears | V9, MEM-06 |
| Integration | `reference-answer-names-holder-account`: a reference whose membership belongs to an account answers met with holderAccountId, the surviving account after a merge; an unclaimed entry answers with evidence alone; nothing the buyer is sent contains the id | V11, X2 |
| End to end | `card-scan-at-door`: a steward scans a membership card on the door page and sees the summary; nobody is admitted by it | MEM-51, with Box office |

The kit's rate limit on typed values, the limit of tickets per holder, the field itself and the door's handling of a failed check are tested by Foundations and Box office.
