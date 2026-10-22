# 0221: A new install lists its set-up in order until each step is started

- Status: Proposed
- Date: 2026-10-21

## Context

On a fresh install the home page says "Nothing is on sale at the moment" and the console overview
lists queues, all empty. The process map of 21 October 2026 found nothing telling a new IT
Manager what to set up, or in what order: a show needs a venue and a season, a performance sells
through ticket types, the rota stamps shifts from a venue's template, and the till sells from the
bar catalogue. **Set-up still to do** (issue 1358) cannot help yet, because each of its lines
reads a module already in use, such as a shift role with no module or stock with no allergen
answer.

## Decision

**The overview carries an ordered first-run checklist for whoever grants roles.** `GET
/api/admin/overview` answers `firstRun`: seven steps in a fixed order (venues, a season, ticket
types, a show, roles for the rest of the committee, a shift template, bar products), each with
whether it is done. It is read only for a holder of `roles.grant`, the IT Manager, who is the one
person a new install is sure to have.

- A step is done once one of its rows has ever existed: any ticket type, any bar product, any role
  grant other than the IT Manager's, archived, retired or expired included. Filtering on status or
  expiry would bring the card back every 1 August, when the committee's grants lapse, or whenever
  a catalogue is archived. It is one constant query of `EXISTS` columns, so its cost does not grow
  with the data (0006).
- Once every step is done the answer is `null` and the card is not drawn. A working install never
  sees it.
- Expiry, archiving and retirement never reopen a step. Deleting the last row of a step does: a
  shift template removed, the last role revoked, the only venue deleted. That is rare on a running
  install and true when it happens, so the card is not made sticky. Keeping a running install
  whole is otherwise **Set-up still to do**'s job, which names what is missing in its own words.
- There is no dismiss: a dismissal would be one more piece of state for a card that clears itself.

## Consequences

- The IT Manager on a new install is shown the order to work in, each step a link to its screen.
- An existing install with any of the seven never started (no bar products, say) shows the card to
  its IT Manager until that step is begun. That is the intended reading: the step is unfinished.
- The order is a recommendation, not a gate: every screen still works in any order.
