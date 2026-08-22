# ADR-0028: A pass request is not a pass

**Status:** Accepted · **Date:** 2026-08-22 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

[10-passes-design](../10-passes-design.md) §7 says, under *Do not build*: **online pass purchase
(there is no payment integration at all)**. That remains true. Proscenium takes no money online, and
this decision does not change it.

But the committee wants a holder to be able to *ask* for a pass on the site and then pay for it in
person, rather than the only route being to catch someone at the box office. Passes are sold before
shows, by volunteers, from a table in the foyer. A member who decides at 2am that they want a season
pass currently has no way to record that intention.

The obvious implementation is to create the `passes` row immediately with some "unpaid" marker on
it. That is the shape this decision rejects.

## Decision

**A request lives in its own table, `pass_requests`, and a pass row is created only when the box
office takes the money.**

- `POST /api/passes/mine/requests` creates a `pass_requests` row. **No `passes` row exists yet**, so
  there is nothing that could admit anyone.
- The box office fulfils a request by issuing a pass through the existing sale path, which records
  who sold it, what was paid and against which price. The request is then `FULFILLED` and points at
  the pass.
- A request may also be `DECLINED`, or expire.
- **Nothing about a request grants admission.** `canRedeem` never sees it, because there is no pass
  to check.

This mirrors `comp_requests` ([13-bar-design §4.1.2](../13-bar-design.md)), for the same reason: the
approval is the control, so the thing awaiting approval must not be the thing that grants the
entitlement.

## Why not an unpaid pass row with a status

It is one table fewer, and it was the first thing I reached for. It is rejected because it makes
every existing and future query responsible for remembering an exception.

`canRedeem` checks `status === 'ACTIVE'`, so an `UNPAID` status would be refused today. The risk is
not today. It is the next person who writes `where status != 'CANCELLED'`, or a report that counts
passes sold, or an export that lists holders. Each of those is correct against the model as it
stands and wrong the moment an unpaid row can sit in `passes`. The failure is silent and the failure
mode is somebody being admitted for free, or the Treasurer's pass revenue being overstated.

A separate table cannot be got wrong by forgetting: a query against `passes` returns passes.

## Consequences

- Pass revenue keeps its single source, `passes.pricePaid`, and stays a record of money actually
  taken. A request has no price paid because no money has moved.
- `pass_requests.quoted_pence` records **what the requester was shown**, which is not necessarily
  what they are charged: prices are date-effective and the box office charges the price on the day.
  Storing it means a discrepancy is visible rather than argued about.
- The box office has a queue to work through. That is a new duty, and it is deliberately small: a
  request that is never fulfilled expires and costs nobody anything.
- `POST /api/pass-types/on-sale` had to become public, since a requester cannot ask for something
  they cannot see. It exposes name, description, validity and price, and nothing else.
- If a payment integration ever arrives, the fulfilment step is where it attaches, and the request
  table does not change.
