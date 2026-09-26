# 0105: A console group with one visible entry renders as that entry

- Status: Proposed
- Date: 2026-09-26
- Amends: 0082 (how a group is drawn, and how long a label may be)

## Context

0040 declared the console sidebar as groups in a fixed order, filtered by ability, and 0082 split
each busy group into Every day and Set-up. Neither said what happens when filtering leaves a group
holding one screen. It happens often. Reports is a group of one for everybody who can see it, and
the Accessibility Officer, the Safety Officer, the Committee and the Treasurer each open a heading
that holds a single screen of theirs. The MVP flow review of 25 September 2026 (issue 1365) found
that each of them clicks a heading only to be shown the one link underneath it. It also found
three screens called Reports, one register under two names, and about eleven labels cut short at
1280 pixels wide ("Shift templ...", "Daily recon...").

The declaration is right as it is: a group is a domain, its prefix is what the middleware guards
by, and a Reports group of one is still the right place for a screen that belongs to none of
front of house, safety or the committee alone (E-126 criterion 5). What is wrong is only how a
group of one is drawn.

## Decision

**At render, a group whose viewer sees exactly one entry is drawn as that entry, a top-level link
in the group's place in the fixed order. A sidebar that draws exactly one group opens it on
arrival.** `shared/utils/console-sidebar.ts` holds both rules (`sidebarParts`, `openOnArrival`)
as pure functions the console layout calls, so a unit test pins them without a browser.

Nothing about the declaration changes. `CONSOLE_NAV` keeps every group, `groupFor` and
`entryFor` answer as before, and the middleware guards the same prefixes. A group of one keeps
its key, so the moment a viewer gains a second screen in it, it is a group again.

Because a link says its screen's own name rather than its group's, every console label names its
screen alone. The cross-season reports are **Night reports**, the bar's are **Bar reports**, and
Money keeps **Comps and discounts**. The register the door calls Challenge 25 is the **Challenge
25 register** in the sidebar too. No two console labels are alike, and a test says so.

A label fits the sidebar at its default width. The sidebar opens at 20 per cent of the window
(256 pixels at 1280) rather than the dashboard's own 15, and no label, group or entry, is longer
than `SIDEBAR_LABEL_MAX`. Both are constants in the same file, and the test reads them.

## Consequences

- Reports is a top-level link for everybody, drawn as **Night reports**, and E-126 criterion 5 is
  reworded to say so.
- An officer whose abilities reach one screen in a group sees that screen by name, not its
  domain. The Accessibility Officer's Box office is **Access profiles**. The group heading
  reappears for anyone who can see two.
- The Treasurer, holding Money alone, lands with it open.
- A wider sidebar takes 64 pixels from the page at 1280. Pages are laid out for the width left
  over, and the dashboard's own resize handle still lets an officer narrow it or collapse it to
  icons. A width an officer has already dragged is kept by the dashboard, so the new default is
  what a fresh browser sees.
- Every console documentation picture shows the sidebar and changes with it. They are retaken
  with the next full pass rather than one by one.

## Options considered

- **Leave the groups as they are.** Refused: a heading that expands onto one link is a click that
  tells the officer nothing, repeated on every visit.
- **Fold Reports into Box office, or into Money.** Refused, as E-126 criterion 5 already refused
  it: its holders span front of house, safety and the committee, and putting it inside one of
  their groups would hand the others a group they cannot otherwise open.
- **Remove one-entry groups from the declaration.** Refused: whether a group holds one entry
  depends on who is looking, and the declaration is the same for everybody (0040). Drawing is
  where the viewer is known.
