# 0040: Navigation is shaped by posture, and filtered by ability

- Status: Accepted
- Date: 2026-09-02

## Context

The admin sidebar was one hard-coded array of eleven links, in one flat group, shown identically to
everybody who reached `/admin`. Four things were wrong with that, and they were the same thing
wearing different hats.

**It was dishonest.** `/api/auth/session` returned identity only, so the client had no idea what
the caller could do. A Training Manager holds `accounts.read`, `members.read` and `rooms.read` and
nothing else, so five of the eleven links opened a screen whose every fetch answered 403. Box
Office, FOH Manager, Front of House and Committee hold no standing permission at all, and an
ordinary member holds none either; all of them got the full eleven-item sidebar. Two screens
carried no route middleware whatsoever.

**Everything that was not a dashboard screen had no navigation at all.** A member's own pages were
reachable only from a hand-rolled list in the public footer. Nothing linked to `/admin`. Nothing
linked to `/foh`, which no route, menu or button referred to anywhere.

**The URL model was accidental.** `/dev` used the admin layout from outside `/admin`, so the
relationship between prefix and shell had already been broken once without anybody deciding it
should be. There was no answer to where a bar stocktake or a trainer's register would live.

**And it was about to be swamped.** The backlog implies roughly 60 to 75 console screens at MVP
against the thirteen that existed, rising past a hundred with V2, plus about seventeen phone-first
show-night screens. Box office, Training, Bar, Spaces and Show night are the concentrations, and
all of them land before the 31 October cutover.

Nothing in the repository governed any of it. 0032 is about inputs, schemas, toolbars, toasts and
tables, and says nothing about navigation. The design language named the dashboard components
without saying how they are arranged.

The timing decided the scope. No route was live when this was written; rooms goes live on
28 September. Fixing the URL model cost a morning, and would have been close to impossible after
cutover.

## Decision

**Four shells, one per posture of work. A prefix names the domain. The nav is one declaration, and
it is filtered by ability.**

### Posture picks the shell

| Shell | For | Chrome |
| --- | --- | --- |
| `default` | Public and expressive: signed out, marketing, ticket booking | `UHeader`, `UMain`, `UFooter` |
| `member` | Your own things, calm, phone-friendly | Site header, sub-nav, account menu, footer |
| `console` | Sit-down work done for the theatre | The `UDashboard*` family |
| `tonight` | Standing up, on a phone, tonight | Plain dark subtree, big targets |

`admin` was renamed `console` and `foh` was renamed `tonight`, because the first will serve
`/bar/stock` and the second covers the till and the backstage board as well as front of house. A
layout named for one of its tenants invites the next screen into the wrong one.

### The prefix names the domain, not the shell

`/admin` means System, and nothing else. A domain that has both audiences puts the member's pages
at the top and the console's under `manage`: `/rooms` and `/rooms/mine` against `/rooms/manage/
requests`. A domain with no member surface sits flat: `/bar/stock`, `/people/accounts`. The console
screens that used to be under `/admin` moved to the domain they belong to, and a catch-all forwards
the old links until cutover.

### One declaration drives the nav and the guard

`shared/utils/site-nav.ts` declares every navigable destination once: the console groups, the
member sub-nav, the account menu and the footer columns. The sidebar renders from it; the console
middleware resolves the current route against it by longest matching prefix and checks the ability
it finds. A deep link and the sidebar therefore agree by construction, rather than because somebody
remembered to add a guard. Adding a screen is adding one entry.

The console groups are nine, in a fixed order that never varies by viewer: Tonight, Box office,
Bar, Spaces, Training, People, Money, Communications, System. A group with nothing visible in it
does not render, which is what lets the order stay fixed while the modules land one at a time. Only
the group holding the current route is open.

### Abilities are a named view over the permission map

`nuxt-authorization` was registered in `nuxt.config.ts` and used nowhere, while `architecture.md`
already described an authorisation resolver under `server/plugins/` that did not exist. Both are
now true. Abilities live in `shared/utils/abilities.ts` and are one-liners over `PERMISSIONS`, so
`roles.ts` stays the only place authority is defined and there is no second vocabulary. The two
resolvers hand an ability its viewer: the server one from the account row and its live grants, the
client one from the account snapshot. Neither reads authority out of the sealed cookie (0007,
0009).

**Filtering is tidiness, never enforcement.** Guards stay server-side and fail closed, and
`requirePermission` remains what refuses: it also holds the MFA gate, which an ability does not.
E-111 criterion 5 already committed the project to this, and it is restated here because a
filtered sidebar makes it easy to forget.

Somebody holding no standing permission is refused with a 403 rather than shown an empty shell.

## Consequences

- **The nav is honest, and a test says so.** `tests/unit/site-nav.test.ts` fails when a console
  screen is missing from the declaration, when any destination anywhere points at a page that does
  not exist, when an ability stands on a permission that is not real, or when the group order
  drifts. `tests/e2e/navigation.test.ts` signs in as an administrator, a Training Manager and an
  ordinary member and asserts what each one's sidebar contains, that a deep link refuses the same
  way, and that an old link still arrives.
- **The account menu is the only way between shells.** It is the one component every shell renders,
  so it is where they reach each other. Tonight appears there only while the viewer is on shift.
- **The footer keeps one shape for everybody.** A signed-out visitor clicking a member link is sent
  through `/sign-in?next=`, and arrives where they meant to, rather than finding the link was never
  offered.
- **Derived authority is in the viewer, not only in the guard.** A department lead reads the
  catalogue and a certified trainer runs a session without holding a standing permission
  (`requireCatalogueReader`, `requireTrainer`, G-110 and G-111), so the viewer carries
  `leadsDepartment` and `isTrainer` alongside its permissions. Filtering on permissions alone would
  hide a screen those people can open, which is the opposite failure to the one this record fixes.
- **Tonight is named before it is built.** The rota has no tables yet, so `onShiftTonight` is
  stubbed false and the ability reads it. When E-102 and E-104 land, one function changes.
- **A permission held without a second factor still shows its link.** The refusal names the way out
  and carries the enrolment path; hiding it would strand the holder with an empty sidebar and no
  explanation.
- A closed group keeps its links in the document, hidden, so the whole sidebar is one thing for a
  screen reader to read and what is filtered out is genuinely absent rather than merely collapsed.
- `/admin` remains the console home as well as the System domain. It is already the de facto
  operations dashboard: the failed-sends list lives there, and around ten stories across five
  modules push items onto something they call the operations dashboard without any story owning it.
  J-203 wants that landing page role-shaped rather than blank. This record names `/admin` as where
  those items go; shaping it is still to do.
- The command palette (`UDashboardSearch`, named in the design language and built nowhere) is the
  right answer once the sidebar passes roughly forty items. Pending-count badges on nav items need
  a count endpoint. Neither is in this change.
