---
title: Rota
description: Setting a show night up from the console, from the venue's staffing to the wings device.
module: Show night
audience: committee
updatedOn: 2026-09-22
updatedBy: Matt Adcock
navigation:
  title: Overview
  icon: i-lucide-clipboard-list
---

These are the console screens under **Manage, Rota**. They are planned at a desk, days before
a performance: how each venue is staffed, who is confirmed on which shift, what the duty manager
must tick before the house opens and after it closes, what front of house reads in an emergency,
and which incidents reach the Safety Officer. The screens used on the night itself, on a phone in
the foyer, are documented under [Show night](/docs/tonight/door).

The **Front of house manager** role holds everything here except Safety: the rota, the checklists,
the emergency cards, the age-check register export and the backstage board's configuration. The
**Safety Officer** role holds Safety and nothing else. The IT Manager holds all of it. A shift never
reaches these screens: a confirmed shift opens the night's tools, and a role opens the planning.

::card-group
  ::card{icon="i-lucide-clipboard-list" title="Shift templates" to="/docs/rota/shift-templates"}
  How each venue is staffed, stamped onto every performance, and which training module gates each role.
  ::
  ::card{icon="i-lucide-check-check" title="Approvals" to="/docs/rota/approvals"}
  Confirming or declining a member's claim when claims queue rather than confirm themselves.
  ::
  ::card{icon="i-lucide-user-round-x" title="Rota board" to="/docs/rota/rota-board"}
  The rota itself: assigning, confirming and standing down shifts, and the reminders that chase a gap.
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
  Which incident severities reach the Safety Officer, and closing the follow-ups they open.
  ::
  ::card{icon="i-lucide-file-down" title="Age-check register" to="/docs/rota/age-check-register"}
  Exporting the Challenge 25 register for a licensing inspection.
  ::
  ::card{icon="i-lucide-radio" title="Backstage board" to="/docs/rota/backstage-board"}
  The milestone types and one-press presets the wings device and the foyer send each other.
  ::
::

## How the pieces fit

1. A **venue** gets a shift template: one duty manager, so many door, so many bar.
2. Adding a **performance** at that venue stamps one open shift per slot, the moment it exists.
3. **Members** claim open shifts from My rota. A claim confirms itself, or waits for
   [Approvals](/docs/rota/approvals), depending on a setting.
4. A **confirmed shift** is what opens the show-night screens that evening, and what the day-before
   reminder and the seven-day digest are counted against.
5. An evening with **no performance** is planned on [Bar openings](/docs/rota/bar-openings)
   instead: it stamps bar slots, they are claimed the same way, and a confirmed one opens the
   till without a house being open.
6. What the duty manager ticks, reads and reports that night comes from
   [Checklists](/docs/rota/checklists), [Emergency cards](/docs/rota/emergency-cards) and
   [Safety](/docs/rota/safety).
