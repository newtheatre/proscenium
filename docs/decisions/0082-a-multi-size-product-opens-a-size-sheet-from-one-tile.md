# 0082: A multi-size product opens a size sheet from one tile, rather than showing its sizes inside the tile

- Status: Proposed
- Date: 2026-09-21

## Context

F-103 criterion 1 says the sale screen shows one tile per product, that a product with multiple
variants "expands to size buttons", and that a single-variant product adds in one tap. The till
built it literally: every size is a pill inside the product's card, in a two-column grid. On the
360 pixel phone the show-night screens are designed for (K-102, `NIGHT_VIEWPORT_PX`), a card is
about 160 pixels wide, so a pill reading "175ml glass · £3.50" is wider than the card it sits in.
The seeded catalogue is the ordinary case, not a corner one: every spirit carries Single and
Double, house red carries 175ml, 250ml and a bottle, and only the packaged drinks carry one size.
A wine card therefore wraps three or four pills over three rows, the cards in a row are different
heights, and the tile's name is pushed off the top of the thumb's reach.

The IT Manager's direction is that pills inside the card are not the right answer. That is a
change to what criterion 1 asks for, not a way of building it, so it is recorded here before the
code moves.

## Decision

**One tile per product, and the tile is the tap target.** It carries the product's name and, for a
product with one size, that size's price. For a product with more than one size it carries "From
£x" and the number of sizes, so a volunteer can see before tapping which tiles cost a second tap.
The allergen affordance stays on the tile beside the name (F-107 criterion 1).

**A product with one size adds to the basket on that tap**, exactly as criterion 1 has always
said.

**A product with more than one size opens a size sheet**: the same `UModal` the mixer choice
already opens from this component, titled with the product's name, holding one large button per
size in a two-column grid, each reading the size and its price ("Pint £4.50"). Choosing a size
adds the line and closes the sheet. The sheet also closes on a tap outside it and on **Back**.

**A size that offers a choice opens the mixer sheet next**, whether it was reached from the size
sheet or straight from a one-size tile: the basket still never holds an unresolved mixer (F-103
criterion 2, 0017). The two sheets follow one another rather than nesting.

**Every tap target on the grid and in both sheets is at least `NIGHT_TAP_TARGET_PX`.**

The decision sits in one function, `tapProduct` in `useTillBasket`, which chooses between adding
the line, opening the size sheet and opening the mixer sheet. `tapVariant` keeps the contract it
had, because a size button in the sheet is still a size button.

## Consequences

- A multi-size drink costs one more tap than it did. The tap it costs is onto a button several
  times the area of the pill it replaces, on a screen used standing up, one-handed, in the dark.
  A single-size drink, which is most of the packaged stock, is unchanged at one tap.
- Every tile is now the same height and the grid scans in two even columns, so the category
  jump chips land where the eye expects.
- Nothing is added to the catalogue. No default or most-sold size is stored, so no screen has to
  maintain one and no product can be set up wrongly.
- A spirit is two sheets deep: size, then mixer. That is two taps on large targets, and it is the
  same two questions the pill grid asked, in a place with room to ask them.
- `data-test="variant-<id>"` moves into the sheet, so a browser test that taps a size on a
  multi-size product opens the sheet first.

## Options considered

- **A full-width tile for a multi-size product, sizes in one row beneath the name.** No extra tap,
  which is its whole case. Rejected on the screen it has to fit: at 360 pixels a full-width row of
  four wine sizes gives each button about 80 pixels, so "175ml glass" cannot be read on it, and
  the seeded catalogue turns the top of the grid into a column of full-width tiles that pushes
  the single-size drinks below the fold. It also gives the grid two tile shapes, and a volunteer
  learning the screen mid-interval learns one.
- **A default or most-sold size as the tile's action, with a small affordance for the rest.**
  Fastest of the three for the common round, and rejected on what it costs elsewhere: it needs a
  new field on every product (F-112's set-up would have to ask for it, or the till would have to
  derive it from sales, which is a report the bar does not have), and a small affordance beside a
  big one is the target that gets missed. A wrong default sells the wrong measure and the
  correction is a void.
- **Leaving the pills as they are.** Rejected by the direction that prompted this record, and by
  the 360 pixel measurement above.

This record amends F-103 criterion 1: "expands to size buttons" is now a sheet of size buttons
opened from the tile, not buttons drawn inside it. The rest of the criterion stands.
