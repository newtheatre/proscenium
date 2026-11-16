# Part B: Conventions

Proscenium is one Nuxt application in one repository, deployed as one Cloudflare Worker per theatre. A theatre forks the whole application and merges upstream releases, so the repository is laid out to make those merges conflict-free. Nothing in this part depends on which modules exist. Most of it is taken from what worked in the Mailflare Nuxt port and in Flytower. The sub-tabs hold the rules for data, for security and interface, and for engineering.

## Runtime on Cloudflare

| Need | Cloudflare product | Note |
| --- | --- | --- |
| Application and API | One Worker, Nuxt with the Cloudflare module preset | Mailflare runs this way in production |
| Data | D1, one database per theatre | Read replicas through D1 sessions, as Mailflare does |
| Files | R2 | Posters, documents, exports |
| Cache | KV | Rebuildable data only, such as public listings cached until something changes them. Nothing in KV is the only copy of a fact; sessions are rows in D1 |
| Background work | Queues | Email sends, imports, report builds, with per-message retry. Two job lanes, prompt and bulk, each with a dead-letter queue, and one queue that receives Cloudflare's email outcomes |
| Scheduled work | Cron triggers | Sweeps, reminders, digests |
| Live screens | A Durable Object | Door counts, backstage board, till sync |
| Email | Email Sending and Email Routing | Outbound mail and replies in |
| Abuse protection | Turnstile and rate limiting | On sign-in, registration and checkout |
| Images | Cloudflare Images | Poster resizing |

One deployment serves one theatre. A theatre with several venues is still one deployment. Hosting many theatres in one deployment is out of scope (decided: single-tenant). Hosts are assumed to be on the Workers Paid plan (decided); the Research tab has the limits and costs.

## What Mailflare taught about Workers

- **Bindings are declared in the Nuxt configuration**, and the deploy configuration is generated from it at build time. The only hand-kept part is the theatre's small wrangler.jsonc, which holds the Worker's name and domain and nothing else.
- **A custom Worker entry is needed** for queue, email and scheduled handlers and for the Durable Object export, because the framework's own hooks run too late for per-message acknowledgement. The custom entry is for production builds only; the development server uses the framework's entry.
- **Development and preview are different tools.** The dev server does not run queue consumers, cron or the Durable Object, so a preview command that runs the built Worker locally is part of the standard workflow.
- **Environment access goes through one helper** that works in requests, queue consumers, cron and the Durable Object alike.
- **Server-rendered public pages, client-rendered app.** Mailflare is entirely client-rendered because it is a signed-in app. The theatre platform needs server rendering for public pages (search engines, social cards) and can render the signed-in app in the browser. Route rules decide per path.
- **Icons and fonts are bundled**, so nothing is fetched from a third party at runtime.

## Repository shape

One repository, forked whole (decided). The rule that makes this workable: **every path has exactly one owner, upstream or the theatre, and neither edits the other's paths.** A merge then has nothing to conflict on.

| Path | Owner | Holds |
| --- | --- | --- |
| `layers/core/` | Upstream | The always-on services |
| `layers/<module>/` | Upstream | One module each: pages, server routes, schema, settings, permissions, translations, tests, docs. Migrations are generated into one top-level migrations folder, with the theatre's own under site/migrations |
| `docs/`, `scripts/`, `tests/` | Upstream | Contributor docs, decision records, known issues, generators, shared test harness |
| `site/` | Theatre | The Nuxt project itself (source in site/app, server in site/server, content in site/content), with upstream's layers beneath it: content pages, overriding pages, layouts and components, and the theatre's own modules under site/layers/x-\* |
| `site.config.ts` | Theatre | The release channel and build-time choices. The Worker's name and domain live in the theatre's wrangler.jsonc; resources are created by the deploy and never named by hand |
| `examples/` | Upstream | Starter content and sample overrides that a theatre copies into `site/` |

- Upstream ships `site/` as a working starter (a home page, a what's on page, a sample content page) and never changes any file under it again, so a theatre's edits there never meet an upstream change.
- Later improvements to the starter go to `examples/`, which a theatre can copy from, so improving the starter upstream cannot conflict with a theatre's pages.
- The Worker's name and domain live in the theatre's wrangler.jsonc, and build-time choices in `site.config.ts`, not in the main configuration file. Mailflare keeps resource ids in its Nuxt configuration, which would conflict on every fork.
- The theatre's folder is the Nuxt project and upstream's layers sit beneath it, which gives override-by-filename inside one repository: a file in `site/` with the same path replaces the upstream one.

### Following upstream

Mailflare follows its upstream with a scheduled workflow, a marker and a porting script, because it rewrites what it receives. A Proscenium fork changes nothing upstream owns, so its version is much simpler.

- **Upstream releases are tags.** Forks merge tags, never the tip of the main branch.
- **A scheduled workflow in every fork** fetches the newest tag on the fork's channel (stable or beta) and opens a pull request that merges it, with the release notes as its description.
- **A check on every fork pull request** fails if a commit touches an upstream-owned path, and says which file to move into `site/` instead.
- **A theatre that must patch upstream code** can, knowingly: the check can be overridden per file, and the override list is the theatre's record of what may conflict later.
- **Merging the pull request deploys**, and the in-app update card applies any migrations.
- **A fix a theatre makes that others would want** goes upstream as a contribution, which the AGPL licence also expects of anyone hosting a modified version.

### The module manifest

A module declares itself in one manifest. The core reads manifests at build time and at run time, and nothing about a module is registered anywhere else.

| The manifest declares | Used for |
| --- | --- |
| Name, the release it arrived in, dependencies | Switching on and off; refusing to enable without a dependency |
| Settings | The settings screens and the tokens public pages may quote |
| Abilities | The permission screens |
| Navigation entries | The menus, filtered by ability |
| Scheduled tasks and queue consumers | The Worker entry |
| Events announced and subscribed to | Communication between modules |
| Data classes of each column | Erasure, exports and privacy documentation |
| Setup steps | The module's guided setup |

### Boundaries

- A module may import from `core/` and from modules it declares as dependencies. A lint rule refuses any other import.
- Modules never write to each other's tables. They announce events and call each other's declared services.
- The core never imports from a module.

### Amended by the foundations specification

The [foundations specification](https://claude.ai/artifact/RKRTkLkrG98jXHSBptUc1x) refines this tab, and where the two differ it wins. Its closing rulings and its "As built" list, at the end of its Formats tab, are the current word; the list below names the ones every reader should know.

- **No per-module version.** The platform has one version; a manifest records the release a module arrived in.
- **Two kinds of dependency:** `requires` (hard) and `uses` (soft, works without the other module). There are no either-or dependencies, so Box office and Bar each require Payments.
- **One cron trigger and a fixed set of queues for the whole Worker.** Modules declare tasks and jobs inside them, so deploy configuration never changes with the module list. Jobs run in two lanes, prompt and bulk, each with a dead-letter queue, and one more queue receives Cloudflare's email outcomes.
- **One migration journal per owner**, upstream's and the theatre's, because tables reference each other across modules.
- **Four ways modules talk:** a service, an event, an extension point, or a fact. Nothing else.
- **Every write is a unit of work** committed as one D1 batch. A service that writes adds statements to the caller's unit and never commits by itself, so a booking, its ledger lines and its audit entry land together.
- **A registry of record types**, so permissions, audit, files and custom fields can all name a kind of record.
- **Every name starts with its module's id**, and a theatre's own module id starts `x-`.

* **Three more rules from later rulings:** a core encrypted credential store (declared as `credentials`) for providers joined by OAuth; append-only tables allow exactly one update, the erasure rewrite; and a service may commit by itself only when it calls outside the Worker, writing an attempt row before and an outcome row after.

- **Ids are scoped and sortable:** `<prefix>_<26 characters>`, ordered by creation time, and an id is never a secret (decided).
- **Reserved address prefixes:** `/account`, `/members`, `/console`, `/live`, `/book`, `/sign-in`, `/setup`, `/api`, `/files`, `/whats-on` and `/shows`. The foundations specification holds the canonical list.
- **One mechanism for conditions on a person:** `core.requirement` answers whether a person meets a condition at a time, for training, membership and anything later. The host module owns the refusal and any override.
- **Events may be internal, and outgoing webhooks are in the first release** (decided), carrying the event name, time, ids and public title only.
- **Tests run on Linux only**, locally and in CI (decided).
- **A signing service in the kit** makes and rotates keys, so door codes can be checked offline.
- **A screen's shell follows whose business it does, never what guards it:** your own things in the members' area or My account, acting for the theatre in the console, one job during a performance as a Live page.

### What the proofs showed

| Proof | Result on 16 November 2026 | Effect on this tab |
| --- | --- | --- |
| Owned paths | Passed. A fork that overrode a page and two components, and added a route and a dependency, merged four upstream releases with no conflict in any owned path | `site/` must be the Nuxt project itself (source in `site/app`, server in `site/server`), not an extended layer, or the upstream layers outrank it. The only conflict was `bun.lock` after the theatre added a dependency; the merge workflow takes upstream's lockfile and reinstalls |
| Local tests | Passed on Linux: unit tests and integration tests inside the Workers runtime against local D1 from one command, in under 2 seconds | Linux is the supported system for tests, locally and in CI. There are no Windows or macOS runs (decided) |
| Last seat | Passed. 11 of 11 cases passed on a deployed D1 database over 20 rounds each, while an unprotected control oversold in 19 of 20 rounds | The capacity mechanism stands as specified |
| One-step deploy | Passed on a real Cloudflare account. The deploy button created the database, file store, cache and queue with nothing typed. Providing a Durable Object and dead-letter queues this way is still to be shown | The button's copy starts with a fresh history, so a story (F-35) links it back to upstream for later merges |

## Extension points for a fork

A fork may do these things in `site/` and `site.config.ts`, and they are guaranteed to survive a merge:

- Add and edit content pages.
- Override a public page, layout or component by placing a file of the same path.
- Add its own module, using the same manifest as upstream modules.
- Set the Worker's name and domain, the release channel and secrets.

What an override may rely on (component props, composables, the manifest format, setting keys) is the public interface. A change to it is a breaking change and is listed in the release notes. Everything else is internal and may change in any release.
