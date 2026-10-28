# 0253: The rota is one sidebar entry that counts its claims, and the overview shows its week

- Status: Proposed
- Date: 2026-10-25
- Extends: A-130 criterion 11 (a queue counted on its entry), issue 1358 (the overview), 0040,
  0082 and 0250.

## Context

The admin review of 24 October 2026 found two things about how the rota is reached. First, it had two
sidebar entries, Rota board and Bar openings. After 0250 and 0252 the board staffs both and plans an
opening from its night, so the second entry led to a screen most officers no longer need to choose.
Second, five queues were counted on the sidebar and the overview, and the rota's own queue was not
one of them. A claim waiting for confirmation was seen only by somebody who opened the board and
ticked the filter, and a night next week with no duty manager was seen only by somebody who scrolled
to it.

## Decision

1. **Rota claims are a counted queue.** `rota-claims` joins `NAV_COUNTS`, decided by `rota.write`.
   It counts exactly what the board's **Waiting for confirmation** filter counts:
   `waitingClaimsCount()`, which is every claim of either kind from tonight's show night on. The
   count rides the Rota entry, and the overview line opens the board on that filter.
2. **One Rota entry.** The board's entry and its page are called Rota. Bar openings stays declared
   in `CONSOLE_NAV`, so the console middleware guards it from the same declaration, but it is marked
   `tabOf: '/rota/manage/shifts'`. The sidebar leaves a tab out and lights the entry it is a tab of.
   Both screens carry the same two tabs, Board and Bar openings.
3. **The overview shows the rota's week.** A reader holding `rota.read` sees **The rota this week**:
   each of the next seven nights that still has a place to fill, or a performance with a duty
   manager shift and none confirmed, each line opening that night on the board. The query is seven
   fixed rows joined with `UNION ALL`, so its parameter count never depends on the rota (0006).
4. **The badge moves when the work is done.** The board and Bar openings re-read the counts after
   they re-read their own data, so answering a claim takes it off the badge.

## Consequences

- A claim waiting on an officer shows from any console screen, as a room request does.
- The sidebar loses an entry without any route losing its guard.
- `tabOf` is available to any later pair of screens that are one job, for example Stock and its
  movements, without inventing a second navigation declaration.
- A night with only a bar opening and no performance can show places to fill, but never "no
  confirmed duty manager": an opening's template is bar slots only.

## Options considered

- **Delete the Bar openings entry and leave the page unguarded by the nav.** The middleware reads
  its ability from the declaration (0040); a page missing from it would fall back to the console
  gate alone and widen who could open it.
- **Count tonight's gaps on the badge as well.** One number would then mean two different kinds of
  work. The badge counts what is waiting on a decision, as every other badge does, and gaps are the
  overview's.
