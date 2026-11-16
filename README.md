# Proscenium

A free, open-source theatre management platform that runs entirely on Cloudflare: box office,
public site, accounts, settings and the modules a theatre switches on.

A theatre forks this repository, writes its own pages under `site/`, and changes everything else
from inside the application. Upstream's releases then merge into the fork without conflicts.

Work in progress. `main` holds tagged releases only; development happens on `next`.

## Running it

You need [Bun](https://bun.sh) and Linux (or WSL). No Cloudflare account is needed to work locally.

```bash
bun install        # also generates the module registry
bun run dev        # http://localhost:3000, with local D1, R2, KV and in-process jobs
bun run preview    # the built Worker under wrangler: real queues and the cron trigger
```

| Command | What it does |
| --- | --- |
| `bun run check` | Lint, type check and the conformance checks |
| `bun run test` | Unit tests (Node) and integration tests (workerd, local D1) |
| `bun run test:browser` | Builds, then runs the browser tests with axe |
| `bun run db:generate -- --name <what>` | Writes a migration after a table changes |
| `bun run verify` | All of the above |

How modules, routes, the unit of work, jobs and settings fit together is in
[docs/kit/README.md](docs/kit/README.md).

## Layout

```
layers/core/        The core module and the kit every module is built with (layers/core/kit)
layers/<module>/    Upstream's modules, one Nuxt layer each
site/               The theatre's own: pages, content, overrides and x- modules
migrations/         Upstream's migrations (site/migrations holds the theatre's)
scripts/            The generator, migration writer and conformance checks
tests/              Unit, integration and browser tests, and fixture modules
```

## Licence

GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
