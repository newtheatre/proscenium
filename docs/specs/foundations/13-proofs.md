# Proofs

## Three proofs, and what each one showed

The design paper asked for three technical proofs before the build starts. Each was run as a small throwaway repository on 16 November 2026, not as product code. Versions used: Nuxt 4.6.4, Nuxt Content 3.16.2, Wrangler 4.162.0, Vitest 5.1.0 with `@cloudflare/vitest-plugin` 1.8.2, Playwright 1.63.0, Bun as the package manager.

| Proof | Result | What remains |
| --- | --- | --- |
| 1. Owned paths | **Passes**, with two findings that change the design | Nothing |
| 2. One-step deploy | **Passes on a real account**, with one finding that changes the design: the button's copy starts a fresh history | A Durable Object and a dead-letter queue were not in the test; they are checked when the build first adds them. The test resources are still to be deleted. |
| 3. Local tests | **Passes**: three tiers, one command each | Nothing. Matt decided that Linux alone is the supported system for tests. |

## Proof 1: a theatre can change its site and still merge every release

**Claim tested.** A theatre that keeps its own work inside the paths it owns never meets a merge conflict when it merges an upstream release.

**Method.** Two repositories: `up` (upstream, with release tags) and `fork` (a theatre, branch `production`). The theatre overrode one upstream page and two upstream components, added a page of its own, a server route in its own module (`x-raffle`), a content collection, its site configuration and a dependency. Upstream then shipped three releases that changed the same page and components upstream, added a layer file, a migration, the Cloudflare configuration, Nuxt Content and a test harness. The theatre merged each tag. A control branch edited an upstream file directly.

**Results.**

| Step | Outcome |
| --- | --- |
| Merge v0.2.0 (upstream edits the page and component the theatre overrides) | Clean. The theatre's versions still win at run time. |
| Merge v0.2.1 (upstream adds files and a dependency) | One conflict, in `bun.lock` only. |
| Merge v0.3.0 (large release: Cloudflare preset, D1, content, tests) | One conflict, in `bun.lock` only. |
| Theatre content collection declared in `site/content.config.ts` | Survives the merge; the built Worker serves `/news/season` from D1. |
| Theatre route `/api/x-raffle/draw` and overridden `/about` | Both served by the built Worker after the last merge. |
| Control: theatre edits an upstream file | Conflict on merge, and the owned-path check names the file before the merge is attempted. |

**A fourth release, added after the first three.** Upstream v0.3.1 taught the configuration to pick up a theatre's own modules from `site/layers/`. The fork merged it with no conflict at all, then added a module `x-raffle` there with a page and a route. Both were served by the built Worker alongside the theatre's overridden page. A theatre can therefore write a whole module without touching an upstream file.

**Finding 1: `site/` must be the Nuxt project itself, not an extended layer.** Listing `site` in `extends` did not let its files win: layers found automatically in `layers/` take priority over an extended one. Making `site/` the application (`srcDir: 'site/app'`, `serverDir: 'site/server'`) gives the theatre's files first priority with no special mechanism, because in Nuxt the project always overrides its layers. Upstream code therefore lives entirely in `layers/`. This is now the rule in the Design tab.

**Finding 2: the lockfile is the one file both sides must change.** A theatre that adds a dependency and an upstream that changes one will always conflict in `bun.lock`. The resolution is mechanical and loses nothing: take upstream's lockfile and run `bun install`, which re-adds the theatre's packages from `site/package.json` (a workspace). The update action does this by itself; the owned-path check exempts the lockfile.

**The check.** `scripts/check-owned-paths` compares the fork with the upstream release it last merged and fails if any file outside `site/`, `site.config.ts`, `wrangler.jsonc` and the lockfile differs, unless the file is listed in `site/overrides.json` with a reason. It ran correctly in all six cases above.

## Proof 2: one step from a repository to a running site

**Claim tested.** A theatre with a Cloudflare account and a GitHub account can get a running copy without creating any Cloudflare resource by hand or pasting any identifier.

**What was run.** The proof repository builds with the Cloudflare preset to a Worker whose generated configuration declares D1, R2, KV and a queue **with no resource identifiers**. `wrangler deploy --dry-run` accepts that configuration and lists all five bindings. The built Worker runs under `wrangler dev` with local copies of every resource and answers a D1 query. A root `wrangler.jsonc` owned by the theatre and holding only the Worker's name is merged into the generated configuration at build time (verified: the name came from the theatre's file, the bindings from upstream's).

**What the documentation says will happen on a real account** (sources in the Sources tab):

- Wrangler creates any KV namespace, R2 bucket, D1 database or queue that is declared without an identifier, named after the Worker, on the first deploy. When the deploy runs from the dashboard or from a connected repository, the identifiers are kept by Cloudflare and are not written back to the repository, so the theatre's repository never holds account-specific identifiers.
- The Deploy to Cloudflare button copies a public repository into the user's GitHub account, lets them name the Worker, provisions resources, connects Workers Builds and deploys. It reads `build` and `deploy` scripts from `package.json` and asks for any secret listed in `.dev.vars.example`, with descriptions taken from `package.json`.
- Workers Builds then deploys on every push to the production branch, with 6,000 build minutes a month on the paid plan.

**Two things the documentation does not settle, which is why a real run is needed.**

1. Whether the button's copy keeps upstream's commit history. The upstream-merge design needs shared history. If the copy is a fresh history, the supported route becomes two steps: fork on GitHub (which keeps history and gives the Sync fork control), then import the fork in the Cloudflare dashboard. Both steps are still clicks with nothing to paste.
2. Whether a Durable Object class and a second queue with a dead-letter queue are provisioned without help on a first deploy from a connected repository.

**The real run, 16 November 2026.** The proof skeleton was pushed to the new upstream repository and Matt pressed its Deploy to Cloudflare button on his personal Cloudflare account. What happened, from his report and from reading the repository and the account afterwards:

- **Resources were created with nothing typed.** A D1 database (`kings-theatre-db`), an R2 bucket (`kings-theatre-files`), a KV namespace and the queue were created, each named after the Worker and its binding. No identifier was pasted and none was written into the repository.
- **The Worker's name went into the theatre's file.** The deploy screen offered a name, `kings-theatre`, and wrote it into the root `wrangler.jsonc` of the new repository, which is the one file upstream leaves to the theatre. Bindings still came from the build. Matt took the name offered, so a typed name was not tried separately.
- **The copy starts a fresh history.** The new repository holds one commit, "source repo import" by cloudflare\[bot\]. It is not a GitHub fork and shares no commits with upstream, so GitHub's Sync fork control is absent and a plain merge of an upstream release is refused as unrelated.

**Linking a button-made copy to upstream, tried the same day.** A copy made from the files of release v0.3.0 as a single fresh commit, with theatre work added on top, was linked by one merge that records the upstream release as a parent and changes no file (`git merge --allow-unrelated-histories -s ours v0.3.0`). The next release, v0.3.1, then merged cleanly in the ordinary way, and the theatre's name and its own page survived. The link needs to know which release the copy was made from, so every release carries its version in a file the copy keeps.

**Design consequence.** Both routes are supported and both are clicks only. The button is the one-step route: the copy is linked to upstream once, using the release version recorded in it, and release pull requests work from then on. Forking on GitHub and importing the fork in the Cloudflare dashboard is the two-step route for a theatre that wants the Sync fork control. The Upstream merges tab describes both.

**Design consequences already taken.** Bindings are declared by upstream in `nuxt.config.ts` with no identifiers and no fixed resource names, so two theatres on one account cannot collide. The root `wrangler.jsonc` is the theatre's file and holds only what is the theatre's: the Worker name, and later a custom domain. Migrations are applied by the application itself on first run, not by a deploy script, so a deploy cannot half-finish.

## Proof 3: the tests run on a developer's own machine

**Claim tested.** The whole suite runs locally with one command per tier, against the same database engine as production, in seconds. Proscenium's known gap is the reason this is a proof: its repository records that no suite exercises the Cloudflare D1 driver and that its suites pass only on CI.

| Tier | Runs in | What it proved | Time |
| --- | --- | --- | --- |
| Unit | Node | Pure rules (state machines) | under 1 s |
| Integration | workerd, with a local D1 per test file | The unit of work on the real driver (below) | about 2 s for both tiers together |
| Browser | Chromium against the built Worker under `wrangler dev` | A page renders and the Worker reads D1 | about 4 s |

**The unit of work was proved on D1 itself.** Four cases, each a design assumption other workstreams rely on:

- A guarded batch is all or nothing: when a guard statement finds the wrong number of changed rows, nothing in the batch is written, including the audit row.
- Four concurrent claims of one lost-property item: exactly one succeeds.
- Twenty concurrent purchases of the last seat: exactly one succeeds and the count never exceeds capacity.
- An append-only table refuses update and delete by trigger, with the one permitted exception (anonymising a name on erasure).

**Finding.** D1 has no way to roll back a batch on a condition, so the guard is a statement inside the batch that fails deliberately when the expected row count is wrong (as built, an insert into the table core\_guard, whose trigger lets a passing row vanish and aborts the batch on a failing one, so the table stays empty; the proof itself used a null into a not-null column of `core_guard`). This is what `unit.expect(rows)` compiles to.

**Closed.** Matt decided on 16 November 2026 that Windows and macOS runs are not needed: Workers run on Linux and the application depends on the browser, not the operating system. Linux is the supported system for tests, locally and in CI. A contributor on another system can use a Linux container or CI.
