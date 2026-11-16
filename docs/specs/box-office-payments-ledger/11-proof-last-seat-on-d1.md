# Proof: the last seat on D1

## The question

The roadmap's gate for the box office phase is that "a full house sells its last seat once". D1 has no interactive transactions, so the usual answer (open a transaction, read what is left, write the sale) is not available. This proof asks whether the database itself can be made to refuse the second sale, so that no application code path can oversell whatever it does.

**Answer: yes, on local D1.** All 11 cases passed, 20 rounds each. It has not yet been run against a deployed D1 database; see Limitations.

**Confirmed on deployed D1, 16 November:** the same 11 cases passed on a real D1 database in Cloudflare, 20 rounds each. See "Deployed run" below.

## The mechanism under test

- **Claims are the truth.** One row per unit or seat, in the state held, confirmed or released. Released is final and a claim is never deleted.
- **A pool carries the capacity** and a `claimed` counter with `CHECK (claimed >= 0 AND claimed <= capacity)`.
- **Triggers keep the counter.** Inserting a live claim adds one; releasing one subtracts one. Application code never writes the counter.
- **A partial unique index** on `(pool_id, seat_id)` over live claims means one seat has at most one live claim.
- **A purchase is one batch:** release the pool's expired holds, then insert one claim per unit. If any insert breaks the CHECK or the index, D1 rolls the whole batch back, so a party is seated whole or not at all.

Cloudflare documents the two properties this leans on: batched statements "are SQL transactions. If a statement in the sequence fails, then an error is returned for that specific statement, and it aborts or rolls back the entire sequence" ([D1 Database API, batch](https://developers.cloudflare.com/d1/worker-api/d1-database/)), and "each individual D1 database is inherently single-threaded, and processes queries one at a time" ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)).

## Method

A throwaway Worker over a local D1 database, run on workerd through Miniflare 4.20260730.0, driven by a script that fires concurrent buyers. Each racing case runs 20 rounds, alternating two ways of racing: every attempt started in the same turn of one Worker isolate, and separate concurrent requests. A control sells the same seat by read-then-write with no constraint, to show the test can detect an oversell at all.

The files are in the project library: worker.mjs, run.mjs, README.md. The whole run takes about 17 seconds.

## Results

| # | Case | Result |
| --- | --- | --- |
| 1 | **Control:** read-then-write, 40 buyers for 1 seat | Oversold in 10 of 20 rounds, up to 40 sales of one seat. The race is real and the test sees it |
| 2 | 40 buyers for the last general-admission seat | Exactly 1 winner in every round; 39 refused as sold out |
| 3 | 300 parties of 1 to 4 for 120 seats | Exactly 120 sold in every round; no party partly seated; counter equals live claims |
| 4 | A party of 3 when 2 seats remain | Takes none; a party of 2 then succeeds |
| 5 | 40 buyers for seat A1 | Exactly 1 winner in every round |
| 6 | 45 buyers for overlapping pairs in a row of ten | No seat sold twice; every winner holds exactly 2 seats |
| 7 | Five different seats, pool capped at two | 2 win, 3 refused as sold out: both constraints hold together |
| 8 | The last seat is held by a lapsed basket nobody has swept | Resold exactly once in every round |
| 9 | A returned seat with 40 people waiting | Resold exactly once |
| 10 | Direct tampering: capacity below sold, reviving a released claim, deleting a claim, forcing the counter | All four refused by the database |
| 11 | Ledger: a posting must balance to be sealed | Balanced postings seal; one a penny out rolls back whole with no rows left behind; a single-entry posting is refused |

## Deployed run

Run on 16 November 2026 with Matt's approval, in his personal Cloudflare account. One throwaway D1 database (created in region ENAM) and one Worker were created, used and deleted; nothing is left in the account. The Worker was the local one byte for byte plus one line refusing any request without a secret header, and its upload was checked by hash. The runner sent real concurrent requests from outside Cloudflare, and for the single-isolate mode asked the Worker to start every attempt in one turn, as locally. 20 rounds per case, no request needed a retry.

| Case | Local D1 | Deployed D1 |
| --- | --- | --- |
| Control: read-then-write, 40 buyers for 1 seat | Oversold only when attempts shared an isolate | Oversold in 19 of 20 rounds: 10 of 10 in one isolate and 9 of 10 as separate requests; up to 40 sold for one seat |
| General admission: 40 buyers for the last seat | Pass | Pass, exactly 1 winner in every round |
| General admission: 300 parties of 1 to 4 for 120 seats | Pass | Pass, exactly 120 sold every round, no party part-filled |
| A party of 3 for 2 seats takes none | Pass | Pass |
| Allocated: 40 buyers for seat A1 | Pass | Pass |
| Allocated: 45 buyers for overlapping pairs in a row of ten | Pass | Pass, 8 to 10 seats sold, none twice |
| Allocated: five different seats, pool capped at two | Pass | Pass |
| Expired hold: 40 buyers for a seat held by a lapsed basket | Pass | Pass |
| Release: a returned seat is resold once | Pass | Pass |
| Database refuses: capacity below sold, reviving, deleting, forcing the counter | Pass | Pass, all four refused |
| Ledger: balanced postings seal, unbalanced ones roll back whole | Pass | Pass, nothing left behind |

What the deployed run adds:

- **The race is worse in production than locally.** Locally the unprotected control oversold only when attempts shared an isolate. Deployed, separate requests oversold too, in 9 rounds of 10. A design that reads then writes would oversell in ordinary use, not only in a contrived test.
- **The mechanism held under that worse race.** Every protected case gave the same answer as locally.
- **A batch is all or nothing on deployed D1.** No party was part-filled in 6,000 competing party claims, and a refused ledger posting left no rows.
- The limitation "not run on deployed D1" below is closed. What remains untested is load beyond 300 simultaneous claims and behaviour with read replication switched on, which the design does not use for writes.

The runner and the raw output are with the proof files: `run-deployed.mjs` and `deployed-result-2026-11-16.txt`.

## What it found beyond pass and fail

- **The control only oversold when attempts shared an isolate.** With separate local requests, each arrived about 6 ms apart, slower than a local database round trip, so read-then-write happened to be safe. A test that races only by separate requests would have passed a broken design. The never-regress tests in part 8 must race inside one isolate.
- **A refused purchase is an error, not an empty result.** D1 reports `CHECK constraint failed` or `UNIQUE constraint failed` and the service maps those to "sold out" and "seat taken". This avoids the trap Proscenium recorded, where a guarded insert that matches no rows does not raise and the batch must be made to fail explicitly ([decision 0035](https://github.com/newtheatre/proscenium/blob/main/docs/decisions/0035-a-multi-row-claim-asserts-its-own-completeness.md)).
- **Triggers, partial unique indexes and table CHECKs all work in D1**, and a constraint that fails inside a trigger-fired update aborts the whole batch.
- **Lazy expiry works.** Releasing expired holds as the first statement of every purchase means a missed sweep never blocks a sale. The scheduled sweep becomes housekeeping, not correctness.
- **Foundations reached the same result independently** on 16 November: a CHECK sold the last seat once under 20 concurrent purchases on local D1, and a conditional update with an expected row count aborts the whole batch when the count is wrong.

## Limitations

| Limitation | Why it matters | How to close it |
| --- | --- | --- |
| Local D1 only | Deployed D1 adds a network hop, replication and its own queueing; the semantics are documented as the same but were not observed | Run the same script against a real D1 database. That needs a database created in a Cloudflare account, so it is a question for Matt (part 9) |
| Modest volume | 300 concurrent parties, not thousands | Repeat at on-sale scale during the phase 3 build, and measure latency under queueing |
| No retry behaviour tested | D1 does not retry writes automatically ([D1 error list](https://developers.cloudflare.com/d1/observability/debug-d1/)), so a lost connection mid-purchase must be retried by the application with an idempotency key | Covered by a named case in part 8, not by this proof |
| Counter contention | Every purchase for a performance updates one pool row. D1 serialises writes anyway, so this adds nothing, but it was not measured | Same deployed run |

## What it changes in the design

1. Capacity is enforced by the schema in part 2 exactly as proved here: claims, a trigger-kept counter with a CHECK, and a partial unique index for seats.
2. General admission and allocated seating share one claim table, so allocated seating in a later phase adds seats without changing how a sale works.
3. The ledger's "a posting balances or does not exist" rule is enforced by a seal row and a trigger, proved in case 11.
4. The concurrency test harness must start attempts inside one isolate.
