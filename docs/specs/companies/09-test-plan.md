# 8. Test plan

Companies has 49 named cases that must never regress: 9 unit, 36 integration on D1 and 4 end-to-end. Each names the rule it guards and the story that brings it. Integration cases run on CI against a real local D1, as every module's do; the concurrency cases fire the competing requests in one `Promise.all`.

## Unit

| Case | Story | Checks | Rule |
| --- | --- | --- | --- |
| `split-share-rounds-down` | CO-30 | 70% of 2,274.01 gives 1,591.80 and shows 0.01 rounding | S4 |
| `net-of-fees-basis` | CO-30 | Basis = gross less refunds less fees with `net-of-fees`; without fees with `gross` | S3 |
| `guarantee-or-split-takes-higher` | CO-30 | Split above the guarantee: one line; below: split plus top-up equal to the guarantee | S2 |
| `hire-fee-bases` | CO-31 | Flat, per performance (3 performances) and per hour (7.5 hours of bookings and calls) | S2 |
| `balance-sign` | CO-30, CO-31 | Company share gives a positive balance; hire fee a negative one; notes add nothing | S4 |
| `agreement-fields-by-deal-type` | CO-18 | Each deal type refuses a missing required field and ignores others' fields | A2 |
| `near-match-name` | CO-06 | "The Splinter Theatre", "Splinter Theatre." and "splinter theatre" match; "Splinter Arts" does not | G1 |
| `call-inside-operating-day` | CO-23 | 03:30 to 05:00 refuses; 22:00 to 03:59 passes | D1 |
| `names-due-follows-start` | CO-26 | A performance moved by a day moves its deadline by a day | A4, L1 |

## Integration

### The gate

| Case | Story | Checks | Rule |
| --- | --- | --- | --- |
| `concurrent-moves-one-wins` | CO-02 | Confirm and cancel at once on one engagement: one succeeds, one refused, one history row, one event | moves |
| `settlement-posts-once` | CO-03 | Approve retried three times: one sealed posting, keyed by the settlement id | S8, M1 |
| `settlement-posts-once-with-invoicing` | CO-03 | With Invoicing on, approval posts nothing; issue posts once; a second issue changes nothing | S8 |
| `last-guest-place-once` | CO-04 | Two contacts name the last place at once: one order issued, one refused, places named equal places | L3 |
| `ended-contact-loses-access` | CO-05 | End a contact; their next read of the engagement and their guest naming are refused in the same second | fact |

### Companies and contacts

| Case | Story | Checks | Rule |
| --- | --- | --- | --- |
| `contact-never-links-unverified` | CO-07 | Adding an email held unverified by another account makes a separate unclaimed account | G2 |
| `one-primary-contact` | CO-07 | A second primary refuses; ending the primary with others asks; ending the last with a live engagement refuses | G4 |
| `company-name-follows-to-production` | CO-12 | Renaming the company updates `company_name` on its linked production in the same batch | G3 |
| `archive-with-live-engagement-refuses` | CO-09 | Refused, naming the engagement | G6 |
| `merge-moves-and-undoes` | CO-10 | Contacts, engagements and references move; duplicate contact rows collapse; undo restores both, events once each way | G5 |
| `private-hirer-erasure` | CO-11 | Erasing the account anonymises name, public name, address; settlements and postings unchanged | G7 |

### Engagements and agreements

| Case | Story | Checks | Rule |
| --- | --- | --- | --- |
| `one-engagement-per-production` | CO-12 | A second engagement on a production refuses, naming the first; after cancelling the first it is allowed | E6 |
| `entry-accepted-idempotent` | CO-13 | The event delivered twice makes one engagement and one contact | E2 |
| `entry-accepted-company-match` | CO-13 | With a company id, that company; without, an exact name match; otherwise a new company | E2 |
| `hire-confirm-needs-booking` | CO-14 | Without a linked confirmed booking (Spaces on) confirming refuses; with Spaces off calls suffice | E3 |
| `agreement-required-setting` | CO-14 | With `agreements.required` on, a visiting engagement without acceptance cannot be confirmed; an act from a call can | E3 |
| `cancel-cleans-up` | CO-16 | Allocations released, holds returned, sent agreement withdrawn, production unchanged | E5 |
| `completes-after-last-date` | CO-17 | The daily task completes only once performances, calls and bookings have all ended; deal `none` settles | E4 |
| `agreement-is-append-only` | CO-22 | An update to any column but state is refused by the trigger; a change writes version 2 and supersedes 1 | A1 |
| `one-answer-per-version` | CO-19 | Two contacts answer at once: one recorded | A3 |
| `only-live-contact-answers` | CO-19 | An ended contact, and a contact of another company, are refused | A3 |
| `paper-answer-not-by-sender` | CO-21 | The person who sent the version cannot record its answer | A3 |
| `settlement-uses-accepted-version` | CO-22 | With version 2 sent but unanswered, a draft settlement applies version 1 | A5 |

### Guests

| Case | Story | Checks | Rule |
| --- | --- | --- | --- |
| `places-held-not-sold` | CO-26 | Accepting makes the hold; Box office's availability drops by the places; nothing is sold | L1 |
| `guest-issued-as-complimentary` | CO-27 | Naming issues a zero-price order on a complimentary ticket type, reported as complimentary | L2, L6 |
| `withdraw-returns-places` | CO-28 | Tickets cancelled, places back in the hold, named count down | L4 |
| `deadline-releases-or-keeps` | CO-29 | At the deadline unnamed places go on sale; with `keep-unnamed` they stay held | L5 |
| `places-never-below-named` | CO-22 | A new version with fewer places than already named leaves the named count | A4 |
| `performance-cancelled-releases` | CO-26 | Cancelling a performance releases its allocation | events |

### Settlements and money

| Case | Story | Checks | Rule |
| --- | --- | --- | --- |
| `figures-frozen-on-proposal` | CO-32 | After proposal, an update to any figure or line is refused by the trigger | S5 |
| `preparer-cannot-approve` | CO-33 | Refused on the statement, even for an owner | S7 |
| `approve-without-agreement-waits` | CO-33 | Before the period with no answer: refused; after: allowed; a query in between: refused | S7 |
| `notes-never-post` | CO-39 | An award note appears on the statement and in no ledger entry | S2 |
| `payments-sum-to-paid` | CO-34 | Two payments summing to the balance make it `paid` and the engagement `settled`; a third refuses quoting both figures | M4, S9 |
| `correction-reverses` | CO-36 | A new version of a paid settlement reverses the old posting and posts the new; the sum of both is the difference | S10 |
| `expected-total-mismatch` | CO-33 | Approving with a stale balance refuses, quoting both figures | M5 |

## End-to-end

| Case | Story | Journey |
| --- | --- | --- |
| `visiting-company-journey` | CO-12 to CO-33 | Programmer links a company, sends an agreement; contact accepts on a phone, names two guests; after the run the finance officer proposes, contact agrees, a second officer approves |
| `act-from-call-journey` | CO-13, CO-20 | An accepted call entry becomes an act; the applicant signs in and sees their slot and Festival's panel |
| `hire-journey` | CO-14, CO-15, CO-31 | An enquiry form makes a hire; a booking is linked; the hire settles with a negative balance |
| `contact-sees-only-theirs` | CO-05, CO-20 | A contact of two companies sees both; a contact of one sees nothing of another's engagement, by address or by search |
