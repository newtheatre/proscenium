# 0254: A delivery note is recorded on one sheet

- Status: Proposed
- Date: 2026-10-25
- Amends: F-114 criterion 5

## Context

A supplier's delivery arrives as one note listing twenty or thirty items. The stock register
records a delivery one item at a time: find the row, press **Delivery**, type the containers and
the cost, press the button, and start again. The admin UX audit of 24 October 2026 found that a
thirty-line note is thirty rounds of the same dialogue, while the order list the order came from
already knows most of the quantities.

## Decision

1. **The stock register offers "Record a delivery note"**, a sheet of every stocked item that is
   not retired, each with a count and a cost. The count is whole containers where the item has
   one container size and its own unit otherwise, and the cost asks the same question a single
   delivery asks (0100).
2. **"Fill from the order list" fills the counts** from the suggested order list's shortfalls,
   in the containers or items it would order (0140). It writes nothing: the person corrects each
   line to what actually came in.
3. **Saving writes every line in one `db.batch`**, each an ordinary `DELIVERY` movement stamped
   with the same actor, so a note is recorded whole or not at all. There is no note record: each
   movement is its own source document, exactly as a single delivery is, and is reversed one by
   one from the movement history.
4. **The route reads the whole catalogue with one fixed statement** to check the lines, rather
   than an `IN` list built from them (0006). A note holds at most 100 lines, which bounds the
   batch; each statement binds a fixed number of parameters. An item named twice, an unknown item
   or a retired item refuses the whole note and names what to fix.

## Consequences

- A whole delivery is one screen and one press. The single **Delivery** button stays for the
  one-item case.
- A wrong line is corrected as any delivery is, by reversing that movement; the rest of the note
  stands.
- The sheet reads every page of active items, by name, with a find box; only the lines typed are
  capped, so a delivery of more than 100 items is two notes.
- The audit trail is the movements themselves, as for every hand-entered movement (0010), so the
  route is exempt from the audit coverage registry.
