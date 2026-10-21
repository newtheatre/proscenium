# 0142: An allergen answer ticks the fourteen, and a note is only detail

- Status: Proposed
- Date: 2026-10-21
- Amends: issue 1348 (the answer lives on the stocked item) and F-107 criteria 1, 3 and 4

## Context

A recorded allergen answer was a free-text note: "Contains sulphites.", "Contains barley
(gluten).", "Contains milk, soya and may contain nuts.". The till read the note out, but nothing
could check it. Two items recorded the same allergen in different words, a typo read as an answer,
and no screen could say which products contain milk without somebody reading every note. UK law
names fourteen allergens a food business must be able to tell a customer about, so the answer has
a fixed shape the system can hold.

## Decision

**A recorded answer ticks which of the fourteen it contains.** The list, its order and its wording
follow the Food Standards Agency's (`ALLERGENS` in `shared/utils/bar.ts`), and every form that
records an answer (a stocked item, the allergen review, a product's own addition, the set-up
wizard) draws the same `AllergenTicks` component.

- A write recorded with nothing ticked is refused, a note alone included: "Tick each allergen it
  contains, or choose Confirmed no allergens". A tick on any other answer is refused too.
- The note stays, optional, for what a tick cannot say: which nuts, "may contain", a supplier's
  wording. It is never parsed.
- A product's answer gathers the ticks of everything it pours and everything the bar adds, once
  each and in the list's order, alongside the state and the note it already derived.
- The till's allergen sheet lists the ticked allergens by name above the note, and the product
  editor's "At the till" line says "Contains milk and soya." before the note.
- The ticks are one text column, comma-separated, on `bar_items.allergens` and
  `bar_products.allergens` (migration 0132, two `ALTER TABLE ADD`s). An unknown code read back is
  dropped rather than guessed at. The audit diff carries the column as written; ticks are not
  personal data.

**Existing answers are never ticked for anybody.** A recorded answer with a note and no ticks is
"recorded in words only": it is still a recorded answer, still read out at the till, and the
allergen review flags it with a count and a badge and sorts it after the unanswered items, so the
bar manager ticks what the note says. Guessing ticks from text would put a food-safety answer in
the record that nobody gave.

## Consequences

- The till says the same fourteen names everywhere, and a later report or filter can ask "which
  products contain milk" of the data rather than of the notes.
- A bar manager re-answers each words-only item once, from the review, before the old note stops
  being the only answer. Until then it reads at the till exactly as before.
- Mulled wine's spices are not among the fourteen, so the seed now confirms it as none with its
  note read out, rather than recording it.
- An importer or script that wrote a note-only recorded answer is refused and must tick.
