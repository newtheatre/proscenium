# ADR-0019: The rota scopes the front-of-house role

**Status:** Accepted · **Date:** 2026-08-21 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

The show night screen ([11-show-night-screen-design](../11-show-night-screen-design.md)) needs a
role for door volunteers, who are not box office staff: they admit people and write incident notes,
and must never see prices, email addresses or takings. That is a fourth role, `FRONT_OF_HOUSE`.

A role on its own is the wrong shape for it. Roles in this estate are granted for a committee year
and carry no notion of *when* (stage-door ADR-0011). A volunteer who works two performances in
October would hold the role every night until the following summer, and it would admit them to
every performance in the programme, including ones they have nothing to do with. The data a door
volunteer sees is not sensitive in the abstract; it is sensitive because it is a list of who is
coming to a specific show on a specific night.

The staffing record ([12-access-and-staffing §3](../12-access-and-staffing-design.md)) answers
exactly the missing question, because it has to exist anyway for the access system's consent model
to mean anything.

## Decision

**The role grants the capability. A confirmed shift grants the scope. Both must hold, and both are
checked on the server.**

| | Where it comes from | What it answers |
|---|---|---|
| Capability | `FRONT_OF_HOUSE` in `shared/utils/appManifest.ts`, granted by the auth service | *May this person work a door at all?* |
| Scope | A `performance_shifts` row, status `CONFIRMED`, on the performance, for today | *Are they working this one, tonight?* |

`BOX_OFFICE` and above bypass the scope, exactly as they bypass other show-night narrowing today.
A `DOOR` shift does not reach the till and a `BAR` shift does not reach the door's screens
([13-bar-design §5](../13-bar-design.md)); the shift's `role` column is what separates them.

The check lives in one function, alongside the other session helpers, and like every resolver it
**must not throw**: a resolver that throws grants rather than denies
([ADR-0008](0008-roles-go-stale-identity-does-not.md)). Absence of a shift is data: no shift, no
scope, and the screen says so rather than erroring.

This app has no ability *tiers*, so `FRONT_OF_HOUSE` is not "below `BOX_OFFICE`". It is a distinct,
narrower set of dotted permission keys mapped to a role in the manifest, which is the only place
role definitions may come from (stage-door ADR-0024).

## Alternatives considered

- **The role alone.** Simplest, and wrong in both directions: too broad in time (all year) and in
  breadth (every performance), for the one screen in the app whose whole purpose is one night.
- **Per-performance grants in the auth service.** Roles there are not per-resource, and making them
  so would put a write on the auth service every time a rota changed. The rota is ours; the identity
  is theirs.
- **Scoping in the UI only.** Not a boundary. The API is the boundary
  ([04-auth-and-permissions](../04-auth-and-permissions.md)).

## Consequences

- **The rota becomes load-bearing before the screen is useful.** The staffing record ships first;
  the FOH shell cannot ship before it, and the programme order reflects that
  ([12-access-and-staffing §5](../12-access-and-staffing-design.md)).
- A performance with no confirmed shifts lights up nothing for `FRONT_OF_HOUSE` holders. That is the
  intended failure, and it is why the admin screen warns about performances inside seven days with
  no duty manager.
- The access-needs visibility rule ([ADR-0022](0022-access-needs-are-special-category-data.md))
  reuses this same test rather than inventing a second one. If the shift test is ever loosened,
  it loosens access to health-adjacent data at the same time. Change it with that in mind.
