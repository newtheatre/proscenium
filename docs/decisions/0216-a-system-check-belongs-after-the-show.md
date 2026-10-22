# 0216: A system check belongs after the show, and an order is shown where it is set

- Status: Proposed
- Date: 2026-10-22
- Amends: E-114 criterion 1 (what a checklist item admits), the rota readiness card (0210)

## Context

The hands-on run of 21 October 2026 saved **Tonight's incidents reviewed** as a pre-show item. Both
system checks read what happened during the night, so before the show neither can ever tick. The
readiness card still counted it and said "Both system checks are on the post-show checklist",
which was not true. Separately, neither Checklists nor the Backstage board set-up showed an item's
order, so where a new item would land was a guess.

## Decision

**A system check is a post-show item.** `checklistItemForm` refuses a system check with any other
phase, and choosing one on the form moves the item to Post-show. The readiness query counts a
system check only on the post-show list, so a row saved before this rule reads as missing rather
than present.

**The order is on the list.** Checklists shows each item's order beside its label, and the Backstage
board set-up has an Order column for milestone types and presets. Ordering stays a number rather
than drag-to-reorder: one write per item, and gaps are allowed.

## Consequences

- An existing pre-show system check is named as missing on the readiness card until it is edited,
  which moves it, or retired.

## Options considered

- **Let the readiness rule check the phase alone.** The form would still accept an item that can
  never tick.
- **Drag to reorder.** Renumbering every row on each drag is many writes for a list of ten.
