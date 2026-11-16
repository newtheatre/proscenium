# Repository and owned paths

## One rule: every file has one owner

A theatre forks the whole repository and merges upstream's releases into it. That only stays painless if no file is edited by both sides. So every path belongs either to upstream or to the theatre, a theatre's customisation always has a place in its own paths, and a check enforces it. Proof 1 showed this works over three releases.

## The layout

```
proscenium/
  layers/                    UPSTREAM. One folder per module.
    core/                      the always-on module (system, identity, domain, interface areas)
      module.ts                its manifest
      kit/                     the kit, imported as #kit
      app/                     pages, components, composables
        components/public/     components a theatre's pages may use
      server/
        api/core/              routes, all under /api/core/
        services.ts            what other modules may import
        db/schema.ts           its tables
      module/                  settings, abilities, facts, presets
      tests/
    forms/                     always on, not switchable
    box-office/                a switchable module, same shape
    ...
  migrations/                UPSTREAM. Generated; one folder per migration.
  scripts/                   UPSTREAM. Generators and checks.
  tests/                     UPSTREAM. Cross-module tests and the scripted fork.
  docs/                      UPSTREAM. Documentation for theatres and contributors.
  nuxt.config.ts             UPSTREAM. Bindings, layers, build.
  content.config.ts          UPSTREAM. Upstream's collections, plus the theatre's.
  package.json               UPSTREAM. Dependencies; names site/ as a workspace.
  .github/workflows/         UPSTREAM. CI and the update action.

  site/                      THE THEATRE'S. The Nuxt project itself.
    app/
      pages/                   the theatre's own designed pages
      components/              overrides of upstream components, and its own
      assets/                  its styles, fonts and images
    content/                   public pages written in Markdown
    content.config.ts          its own content collections
    server/                    its own routes, if any
    layers/x-*/                its own modules, same shape as upstream's
    migrations/                migrations for its own modules
    public/                    static files
    package.json               its own dependencies
    overrides.json             the short list of upstream files it has knowingly changed
  site.config.ts             THE THEATRE'S. Release channel and build-time choices.
  wrangler.jsonc             THE THEATRE'S. The Worker's name and domain. Nothing else.
  bun.lock                   SHARED. Resolved mechanically (see Upstream merges).
```

Upstream ships `site/` as a working starter (a home page, a what's on page, a sample content page) and then **never changes any file under it again**. Improvements to the starter go to a separate `examples/` folder that a theatre can copy from.

## How a theatre customises, from lightest to heaviest

| The theatre wants to | It does this | Touches upstream? |
| --- | --- | --- |
| Change a name, colour, logo, wording of a term, a policy number | Console: branding, vocabulary, settings | No, and no deploy |
| Write or edit a public page | Markdown in `site/content/`, using published components and `:setting` tokens | No |
| Design a public page freely | A Vue page in `site/app/pages/` | No |
| Add a kind of content (news, people, archive notes) | A collection in `site/content.config.ts` | No |
| Change how one upstream component looks | A file of the same name in `site/app/components/` | No: the project's file wins |
| Replace an upstream page | A file at the same path in `site/app/pages/` | No |
| Add a feature of its own | A module in `site/layers/x-<name>/` with a manifest, tables, settings and abilities | No |
| React to something that happens | A listener in its own module | No |
| Add to a screen | A contribution to a point from its own module | No |
| Change upstream behaviour that has no setting, point or override | First ask upstream for a setting or a point. As a last resort edit the file and list it in `site/overrides.json` with a reason | Yes, knowingly |

The first row matters most: nearly everything a committee wants to change is in the console and needs no repository at all.

**Overriding is a promise in one direction.** Published components (`layers/*/app/components/public/`) keep their names and inputs within a major version, so a theatre's override or page keeps working. Other components may change in any release; a theatre that overrides one is told by the update pull request when the original changed (the action lists overridden files whose upstream version differs in the release).

**Reserved addresses.** The address prefixes that belong to upstream are listed once, in the Module manifest tab under "Reserved address prefixes". A page in `site/` at one of those is refused by the check unless it is an override of an existing upstream page.

## A theatre's own module

Proved working: a folder under `site/layers/` with a page and a route was picked up by upstream's configuration, built, served and survived a merge. Its rules are the same as an upstream module's, with three additions:

- Its id starts with `x-`, so do its tables (`x_raffle_tickets`), settings, abilities and routes (`/api/x-raffle/`).
- Its migrations live in `site/migrations/` and are applied after upstream's.
- It may `require` or `use` upstream modules; an upstream module can never depend on it.

It passes the same conformance checks, including erasure, with no extra work.

## The owned-path check

`bun run check:paths`, in CI on every pull request in a fork and in the update action.

1. Find the upstream release last merged (the newest release tag reachable from the branch).
2. List every file that differs from that release.
3. Pass if each is under `site/`, or is `site.config.ts`, `wrangler.jsonc` or `bun.lock`, or is listed in `site/overrides.json`.
4. Otherwise fail, naming each file and where that kind of change belongs.

In upstream's own repository the check runs the other way: a pull request may not change anything under `site/` after the starter is frozen, nor `wrangler.jsonc`.

## What is generated and never edited by hand

The registry, the migration bundle, route type definitions and the Wrangler deploy configuration are produced by the build and are not committed. Nothing a theatre needs to merge is generated into a committed file, which is what keeps the lockfile the only shared one. Mailflare commits generated route stubs and marks them; this design avoids the need.
