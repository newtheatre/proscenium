# 0110: The Front of House Manager holds the bar

- Status: Accepted (IT Manager, 29 September 2026)
- Date: 2026-09-29
- Amends: 0044 (the officer role holding each night permission), 0077 (whose officer opens the
  till at a bar opening), and 0099 (who reviews a stocktake before it is applied)

## Context

The 2026/27 constitution gives the whole bar to one post. The Front of House Manager is
responsible for "refreshment sales", the bar licence, "Purchasing stock, and stock taking" and "The
handling of the Sum-Up card machine" (4.4.1), takes a weekly shift "to appropriately monitor bar
stock" (4.4.2), and keeps "the general maintenance of the bar" (4.4.3). No post is called Bar
Manager. The system nonetheless kept `BAR_MANAGER` as a role of its own, holding `bar.read`,
`bar.write`, `bar.stocktake` and 0044's `night.till` bypass. Its two live grants on 26 September
2026 belonged to the Front of House Manager and to one IT Manager, and the IT Manager decided that
day that the Front of House Manager takes the regular stock count.

The #1211 audit of 23 September suggested keeping the two roles apart. It cited E-111 criterion 1
and F-101 criterion 2, but both are about shifts: a door shift does not open the till. "No two
share one" is a code comment on `NIGHT_ROLE_PERMISSION` about the three shift roles; the only text
in 0044 that separates the officers is its clause "and neither does the front of house officer's
role". The role audit against the constitution (26 September, on issue #1211) reversed that point.

## Decision

**`FOH_MANAGER` holds the bar.** It gains `bar.read`, `bar.write` and `night.till`, alongside the
`bar.stocktake`, `night.door` and `night.manage` it already held. `NIGHT_ROLE_OFFICER.BAR` names the
Front of House Manager, so every till refusal points at a post that exists. `BAR_MANAGER` leaves
`ROLES` and its grants fold into the holder's `FOH_MANAGER` grant (0112, migration 0130).

**One officer role holds all three bypasses.** A shift still opens only its own screen: a door
shift does not open the till (E-111 criterion 1). The officer's bypass is still 0044's: tonight
only, a second factor to use it (A-112), and every use recorded when it acts (0098) and flagged on
the night report by the night role it stood in for.

**Closing an earlier night's till session is the role's standing act** (F-102 criterion 5), audited
as a till close and not as a bypass, as `server/utils/till-close.ts` already does. Writing off any
variance stays with the Treasurer (4.3.2, I-104).

**A bypass at a venue with no night report surfaces on the period's reports.** With the Front of
House Manager holding the till bypass, a till opened at a bar opening, or at a venue with nothing
planned, has no night report of its own (E-130 criterion 6). The Performances tab of the Night
reports screen (E-126) lists each such bypass for the period: the night, the venue, the opening's
label or none, the role stood in for and the officer, read from the `night.officer-bypass` audit
rows.

**Every comp has a second person.** Ticket comps are requested at the desk, which only the Front of
House Manager and the IT Managers reach, and are approved by tonight's duty manager or an IT
Manager; the route refuses the requester. Bar comps and cap overrides are requested by volunteers
on a bar shift and approved by tonight's duty manager or the Front of House Manager; F-110 criterion
1 refuses a requester's own comp. Self-dealing on voids, cap overrides, refunds and access
verification is refused where the write happens (0115).

## Consequences

- One grant sets prices, works the desk, refunds on any day, adjusts stock, applies a stocktake,
  voids tab charges and opens all three show-night screens without a shift. The live holder already
  held all of it through two grants, so nobody's exposure changes on the day this lands.
- The controls that answer the concentration ship with it: 0115's self-dealing refusals, the
  night report's per-role bypass flags (0098, E-123), and the Treasurer's review of the Z variance
  and any write-off (I-104), which 0097's till-close reader total feeds.
- 0044's clause "and neither does the front of house officer's role" no longer holds; "a door
  shift still does not open the till" stands. Its consequence "`BAR_MANAGER` is a new role" and its
  second-factor question are history.
- 0077's "the bar manager's officer role" is the Front of House Manager's. 0099's "the Bar Manager
  reviews every line before Apply" is the Front of House Manager.
- Every till refusal's wording changes from "the Bar Manager's role" to "the Front of House
  Manager's role", and operator pages that pictured it are retaken when the pictures next run.
- The module F stories may keep "Role: Bar manager" as the name of the job, as 0090 kept "Box
  Office Manager"; each officer criterion names the Front of House Manager's role.

## Options considered

- **Keep `BAR_MANAGER` for a bar lead outside the Committee.** No post exists for it, and
  volunteers work the bar from shifts (0009), so nobody at handover would know whom to grant it.
- **Give the Front of House Manager `bar.stocktake` only**, as the review plan's question 9
  proposed. 4.4.1 and 4.4.3 give the post the whole bar, not only the count.
- **Move the earlier-night till close to `finance.write`.** Closing records the reader, which is
  the Front of House Manager's (4.4.1); writing off the variance is already the Treasurer's.
