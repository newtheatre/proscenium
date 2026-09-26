# 0100: The delivered cost of measured stock is held per container

- Status: Proposed
- Date: 2026-09-26

## Context

A delivery's cost was kept as `stock_movements.unit_cost_pence`, whole pence for one unit of the
item's own counting unit. For something measured in millilitres that unit is a millilitre, and a
millilitre of a drink costs a fraction of a penny: the delivery form rounded a £6.50 bottle of
750 ml to 1p a ml, which is £7.50 a bottle, and a £1.20 two-litre mixer to nothing at all. The
guided set-up went the other way and sent a bottle's price as the price of each millilitre, so an
opening delivery of 4,500 ml was costed at 650p a ml. Gross profit (F-119), the wastage report and
a stocktake's variance at cost all read this figure, so every one of them was wrong for measured
stock. Issue 1320 found it in the MVP flow review of 25 September 2026.

Money is integer pence (0004) and stock movements are append-only (0010), so the fix could neither
store a fraction of a penny nor restate a row once written. No live movement carried a cost yet,
which made this the moment to change what is recorded rather than to repair anything later.

## Decision

**A delivery of a measured item records what one container cost and what it held.** Two new
columns on `stock_movements`: `container_cost_pence`, whole pence for one container, and
`container_qty`, what that container held in the item's own unit. Where the item has no one
container size (a keg that varies), the whole delivery is the container: its cost and its
quantity. A whole item, whose unit is the thing bought, keeps recording `unit_cost_pence`, which
is exact already.

**The cost is divided only when it is read.** One expression values stock
(`unitCostPence` in `server/utils/bar-reports.ts`): each standing delivery's cost a unit is
`container_cost_pence / container_qty`, or `unit_cost_pence`, weighted by quantity across the
item's deliveries. Every figure built on it (gross profit, wastage, the variance report, a
stocktake's preview) is rounded to whole pence once, where it is shown or summed. Nothing is ever
stored divided.

**No row is rescaled.** A row written before this carries a unit cost and is read as it always
was. The new columns are added bare and nullable, so the migration rebuilds nothing (0010), and a
trigger rather than a CHECK holds the pair whole: both or neither, on a delivery only, a container
that holds something, a cost of no less than nothing, and never beside a unit cost.

**Every screen asks the way the stock is bought, and sends that one figure.** The stock screen's
delivery asks the cost of one container for an item with a container size, the cost of the whole
delivery for one without, and the cost of one for a whole item (`deliveryCostBasis`,
`DELIVERY_COST_QUESTION`). The guided set-up's opening delivery asks the same way. Both write
routes take that one `costPence` and decide how it is kept from the item they have already
loaded (`deliveryCost`), so no caller can send a price a millilitre.

## Consequences

- Reports and a stocktake's variance agree to the penny, since they share one reading and each
  rounds once; integer pence holds for everything stored and everything shown (0004).
- The append-only movement rows are untouched: the change is two nullable columns and a trigger.
- The development seed records its measured stock's per-bottle prices as container costs, which
  also corrects a seed that had been storing them as prices a millilitre.
- The API takes what was paid, not how it is stored: `unitCostPence` is no longer a field a
  caller can send, and a whole item's cost is still kept as its cost a unit.
- The quantity itself is still entered in the item's own unit; counting a delivery or a stocktake
  in containers is issue 1321 and issue 1349's, and builds on this.

## Options considered

- **Keep whole pence a millilitre.** The defect itself: the rounding is up to a penny a millilitre,
  which is most of the price of a glass.
- **Tenths or hundredths of a penny a millilitre.** Rejected under 0004: a second money scale
  beside integer pence is the thing that decision exists to prevent, and it only moves the
  rounding somewhere smaller.
- **Pence a litre.** Still rounds (a 70 cl bottle at £14 is exact, a £1.20 two litres is 60p a
  litre and fine, but a keg's odd size is not), and still stores a divided figure the next
  container size breaks.
- **Store only the container cost and read the size from the item.** The item's container size is
  fixed once stock has moved, but a keg has none, and a row that names its own container reads
  the same whatever later happens to the item.
