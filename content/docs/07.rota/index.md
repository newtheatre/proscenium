---
title: Rota
description: Setting a show night up from the console, from the venue's staffing to the wings device.
module: Show night
audience: committee
updatedOn: 2026-09-29
updatedBy: Matt Adcock
navigation:
  title: Overview
  icon: i-lucide-clipboard-list
---

These are the console screens under **Manage, Rota**. They are planned at a desk, days before
a performance: how each venue is staffed, who is confirmed on which shift, what the duty manager
must tick before the house opens and after it closes, what front of house reads in an emergency,
and which incidents reach the Theatre Manager. The screens used on the night itself, on a phone in
the foyer, are documented under [Show night](/docs/tonight/door).

The **Front of House Manager** role holds everything here except Safety: the rota, the checklists,
the emergency cards, the Challenge 25 register export and the backstage board's configuration. The
**Theatre Manager** holds Safety and the emergency cards, and the **President** reads Safety
without changing it. The IT Manager holds all of it. A shift never reaches these screens: a
confirmed shift opens the night's tools, and a role opens the planning.

::card-group
  ::card{icon="i-lucide-clipboard-list" title="Shift templates" to="/docs/rota/shift-templates"}
  How each venue is staffed, stamped onto every performance, and which training module gates each role.
  ::
  ::card{icon="i-lucide-user-round-x" title="Rota board" to="/docs/rota/rota-board"}
  The rota itself: assigning shifts, confirming and declining the claims waiting, standing down, and the reminders that chase a gap.
  ::
  ::card{icon="i-lucide-beer" title="Bar openings" to="/docs/rota/bar-openings"}
  Planning and staffing an evening with no performance: a hire, a society social, a get-in.
  ::
  ::card{icon="i-lucide-list-checks" title="Checklists" to="/docs/rota/checklists"}
  Writing the pre-show and post-show checklist each venue's duty manager works through.
  ::
  ::card{icon="i-lucide-siren" title="Emergency cards" to="/docs/rota/emergency-cards"}
  The card front of house reads in the dark: address, exits, assembly point, first aid.
  ::
  ::card{icon="i-lucide-shield-alert" title="Safety" to="/docs/rota/safety"}
  Which incident severities reach the Theatre Manager, and closing the follow-ups they open.
  ::
  ::card{icon="i-lucide-file-down" title="Challenge 25 register" to="/docs/rota/challenge-25-register"}
  Exporting the Challenge 25 register for a licensing inspection.
  ::
  ::card{icon="i-lucide-radio" title="Backstage board" to="/docs/rota/backstage-board"}
  The milestone types and one-press presets the wings device and the foyer send each other.
  ::
::

## How the pieces fit

1. A **venue** gets a shift template: one duty manager, so many door, so many bar.
2. Adding a **performance** at that venue stamps one open shift per slot, the moment it exists.
3. **Members** claim open shifts from **Rota**. A claim confirms itself, or waits for an
   officer on the [rota board](/docs/rota/rota-board#waiting-for-confirmation), depending on a setting.
4. A **confirmed shift** is what opens the show-night screens that evening, and what the day-before
   reminder and the seven-day digest are counted against.
5. An evening with **no performance** is planned on [Bar openings](/docs/rota/bar-openings)
   instead: it stamps bar slots, they are claimed the same way, and a confirmed one opens the
   till without a house being open.
6. What the duty manager ticks, reads and reports that night comes from
   [Checklists](/docs/rota/checklists), [Emergency cards](/docs/rota/emergency-cards) and
   [Safety](/docs/rota/safety).
