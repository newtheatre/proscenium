# 0165: A holder adds to their own tab from My NNT

- Status: Proposed
- Date: 2026-10-22
- Amends: F-108 (adds criterion 7)

## Context

Tab holders are committee members who are often behind the bar themselves, or at it when nobody is
serving. Every tab charge went through the till, so a holder wanting a can had to find someone on
shift or ring it up on the till themselves. Matt asked for a way to add to your own tab without the
till.

## Decision

**My NNT's Bar tab page offers Add to my tab, posted as the till's own sale.**
`POST /api/account/tab/charge` calls `commitSale` with the holder as both actor and debtor, on the
open till session of the bar they pick (`GET /api/account/tab/bar` lists tonight's open bars).

- It needs no shift: authority is being an authorised holder now (criterion 1, 0009), checked live.
- It rides tonight's open session, so the charge sits on that bar's night and its close (F-102).
  With the till shut there is nothing to add to.
- The cap, the expected-total check (0004) and stock all hold, because it is the same write.
  The holder can never override their own cap (0116).
- Nothing that needs a Challenge 25 check is offered or accepted: nobody is there to ask it. A
  size whose choice must be answered is left to the bar too; an optional choice is sent as none.
- No discount: a discount is the bar's call, not the holder's.

## Consequences

- The bar's report shows these as tab charges by the holder, which is what they are.
- A holder could add drinks they never took; the tab is theirs to pay, and voids stay with the
  Front of House Manager (F-109).
