# 5. Screens

Eleven console screens and one in the account. The board is the screen that matters; everything else is an ordinary Nuxt UI list, record page or modal following Interface's page conventions. Nothing here is on the public site: the call form is the form builder's page, and the timetable is Festival's.

## Inventory

| # | Screen | Address | Who sees it | Release |
| --- | --- | --- | --- | --- |
| 1 | Programme: the list of plans, newest season first, with counts and a hard-clash badge | `/console/programme` | `plan.view` | First |
| 2 | Plan overview: the call (open, closes in, responses), entries by state, placed against wanted, hard clashes, last published, "Unpublished changes: 4", next step | `/console/programme/<season>` and the season's "Programme" tab | `plan.view` | Gate |
| 3 | Board, Day view: spaces across, time down, tray, warnings | `/console/programme/<season>/board` | `plan.view`; dragging needs `placement.manage` | Gate |
| 4 | Board, Season view: spaces as rows, days across, each cell a count and a bar of use; offered slots drawn as bands; drop a run onto a slot | same, `?view=season` | as 3 | First |
| 5 | Entries: a list (search, state, source, placed or not, has warnings, collection), right-click to accept, decline, open | `/console/programme/<season>/entries` | `entry.view` | Gate |
| 6 | Entry: details, people, entry windows as a small timeline, needs, rights, slot choices, the response read through the form builder's panel, placements, notices sent, warnings | `/console/programme/entries/<id>` | `entry.view`; the response panel follows the form builder's own read rules, so reviewers' scores show only to those who may see them | Gate |
| 7 | Call: attach a form to the call slot (the form builder's placement control), its dates, the offered slots list | `/console/programme/<season>/call` | `plan.manage` | First |
| 8 | Offered slot editor: label, space, days, pattern (start from a run preset), takes | side panel on 7 | `plan.manage` | First |
| 9 | Publish review | modal over 3 | `plan.publish` | Gate |
| 10 | Tell acts: who will be told, what each will read, Send | modal over 2 | `plan.publish` | First |
| 11 | Planning spaces: per space, on the board or not, order, changeover, tech features offered | cog modal on 1 to 3, as module settings are reached from the console (memory: "Module settings under Admin > Modules, reached from console via a cog modal scoped to the page") | `plan.manage` | First |
| 12 | My entries: each entry's title, state in plain words, and once told its slots with venue and time | `/account/entries` | The applicant, and anyone on the entry as a contact | First |

## The board

_[Diagram: board, Day view · desktop wireframe]_

The tray lists entries with fewer placements than they want: accepted first, then candidates (which can only be pencilled), each card with its length, what it wants, its first warning, and its collection colour. Everything not this plan's (scheduled shows of other seasons, room bookings, rehearsal calls through Spaces, closures) is drawn grey behind, from core's occupancy service, with a label only where the viewer may see it.

| Element | Behaviour |
| --- | --- |
| Drop on empty time | An accepted entry makes a draft performance of its running time (P3); a candidate makes a pencil (P1). Snaps to 5 minutes |
| Drop on a block | Into that performance's line-up (P5), after asking "Add to the line-up of Dance Showcase?" |
| Drag a block | Moves it; get-in and get-out show as faint bands either side while dragging; warnings recalculate on release |
| A block's menu (right-click or the three-dot button) | Open entry, Use option 2, Acknowledge warning, Remove, Show in core |
| Warnings | A red bar on the block for hard, amber for a warning, none for notes; the bar's count opens a side panel listing all, grouped by kind, each with Show and Acknowledge |
| Day tabs | The plan's days, or Festival's days when it contributes them; a festival opens on today during the festival |
| Keyboard | Every drag has a keyboard route: select a card, choose space and time from two dropdowns, Place. The board is usable without a mouse |
| Phone | Read-only list by space and time with warnings; placing needs a wider screen, and the page says so |
| Two programmers at once | Moves arrive live through the realtime hub; a stale write is refused and the board reloads (P8) |

## The publish review

One modal, read top to bottom, with one primary button.

1. **What will be scheduled.** "38 performances in 4 spaces over 4 days", expandable by day.
2. **What stops it.** Each hard clash in a line ("Choir and Brass Quintet overlap in the Chapel on Saturday at 14:30"), each with Show on board. While any is listed, the button is disabled and says why.
3. **Warnings not acknowledged.** Listed, collapsed, with Acknowledge all; they do not stop the publish.
4. **What it does elsewhere.** Core's change impact, word for word ("3 room bookings will be bumped and their bookers told").
5. **Productions.** "Also publish 12 productions still in draft", a checkbox with the plan's default.
6. **Who will be told.** "31 people about 22 entries, now" or "when you press Tell acts", with Preview a notice.
7. **Publish 38 performances**, the count in the button. A refusal comes back in the same modal, listing each placement core refused and why, and nothing has changed.

## Copy

British English, platform words on staff screens (production, performance, season). Empty board: "Nothing placed yet. Drag an entry from the tray, or add one." A hard clash: "Will not publish: the Studio is closed then (Building maintenance)." A pencil to another module's user: "Pencilled for a possible show. It will not stop your booking."
