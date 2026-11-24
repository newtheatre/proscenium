# Build notes

What the build settled that the parts above leave open, and where it differs from them. Each entry names its story.

## BO-73: door headcount

- **Where it lives.** The counter is `/live/door/<performance>/count`, reached by the Scan and Count tabs at the top of the live door. A performance never put on sale and with no bookings opens on Count (HC1). The server is `layers/box-office/server/headcount.ts`; the arithmetic, shared with the device, is `layers/box-office/shared/headcount.ts`.
- **Presses.** `POST /api/box-office/performances/<id>/headcount/taps` takes one press or an offline batch, oldest first, each with an id made on the device (`hct_`, as the kit makes ids). A stored id answers `sent` and changes nothing (HC2). Each answer says `counted`, `sent`, `out-not-offered`, `not-found`, `not-undoable`, `already-undone` or `too-late`, with the figures after.
- **Undo (HC5).** An undo is a row of kind `undo` naming the press it reverses; a unique index keeps a press from being undone twice. The device undoes its own newest press while `box-office.door.undo-within` lasts, measured by the device's clocks, so an undo made offline is judged when it was pressed. After the window, `POST .../headcount/correct` takes a reason from the new vocabulary `box-office.headcount-correction` and needs `box-office.headcount.correct` (which implies `ticket.admit`; added to the Front of house manager role template). The reason is kept on the row as `reason_term_id`, a column the data model above does not list, and the correction is audited with the reason's slug and no free text.
- **Figures.** `headcountFor(performanceIds)` answers as a set: `{ admitted, walkUps, in, out, inside, peak, capacity }`. `admitted` is tickets scanned and is never added to the counter's figures. `walkUps` is everyone counted in. `peak` is the most inside at once by the devices' clocks. `inside` never goes below nought.
- **Full.** The counter warns from `box-office.door.full-warning` per cent of capacity and reads "Full: n of capacity" at capacity, never refusing (HC4). `box-office.headcount.full` is announced once, the first time inside reaches capacity.
- **Out (HC3).** Out is offered while `box-office.door.count-out` is on. Drop-in performances (C-62) are not on `next` yet; when they land, `countsOut` in `headcount.ts` also answers true for them, and the counter's heading reads Inside for them.
- **Night report.** Box office's attendance section adds "Walk-ups counted in", "Counted out" (when any) and "Most inside at once" when the counter was used.
- **Left for BO-74.** The `festival.*` contributions wait for Festival's points, and `core.measure` for Reports'; the Tonight hub's "Inside now" figure waits for drop-in performances.
