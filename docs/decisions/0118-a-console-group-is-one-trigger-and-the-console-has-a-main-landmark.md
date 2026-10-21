# 0118: A console group is one trigger, and the console has a main landmark

- Status: Proposed
- Date: 2026-10-14

## Context

The hands-on review of 13 October 2026 ran axe over the staff console and found two structural
faults that the skipped console case in `tests/e2e/accessibility.test.ts` (held by the contrast of
issue 1574) had hidden. The console layout put every screen in a plain `div`, so the console had no
`main` landmark and a screen reader user could not jump past the sidebar. And each sidebar group
drew its chevron as a second Reka `AccordionTrigger` rendered as a `span`, which carries
`aria-expanded` on an element whose role cannot hold it (axe `aria-allowed-attr`).

The chevron comes from `UNavigationMenu` in `@nuxt/ui` 4.11.0, which makes the trailing slot a
trigger for every vertical item with children. That is needed when the item is also a link, so a
click on the label navigates and a click on the chevron opens. A console group is never a link: its
whole row is already the trigger (a `button`), so the chevron is a duplicate and the invalid one.

## Decision

**The console layout wraps every screen in one `<main id="main">`.**

**`@nuxt/ui` is patched (`patches/@nuxt%2Fui@4.11.0.patch`) so the trailing chevron is a trigger
only for an item that is also a link.** For a group with no `to` or `href` it is a plain `span`
without ARIA state, and a click on it is left to reach the row's own trigger rather than being
stopped. `tests/unit/navigation-menu-patch.test.ts` is the patch's contract, and a scoped axe case
in `tests/e2e/accessibility.test.ts` scans a console screen for the landmark and attribute rules
while the full scan waits on issue 1574.

## Consequences

- A `@nuxt/ui` bump that no longer applies the patch fails `bun install`, as `CONTRIBUTING.md`
  asks; the patch may be dropped once upstream renders the chevron the same way.
- Every console screen gains the landmark with no change of its own.

## Options considered

- **Making every group a link to its first screen.** Rejected: 0105 already settled when a group is
  drawn as an entry, and a heading that navigates as well as opens surprises.
- **Removing the attribute after mount.** Rejected: the server-rendered page would still carry it,
  and a script fixing markup is a trap for the next reader.
