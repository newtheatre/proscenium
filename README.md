# Proscenium

Proscenium is the Nottingham New Theatre's public website **and** its box office — one Nuxt 4
application, deployed to Cloudflare Workers, serving [`newtheatre.org.uk`](https://newtheatre.org.uk).
It handles what's-on listings, online booking, walk-ins and collection on the door, and the admin
tools behind them.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Nuxt 4, Vue 3, Nuxt UI 4 |
| Server runtime | Nitro on the `cloudflare_module` preset — runs as a Cloudflare Worker, not Node |
| Database | SQLite: a local file in development, Cloudflare D1 in production |
| ORM / migrations | Drizzle ORM + Drizzle Kit, via NuxtHub's `hub:db` layer |
| File storage | Cloudflare R2 (posters, venue images) via NuxtHub's blob layer |
| Auth | `nuxt-auth-utils` (sealed cookie sessions) + `nuxt-authorization` (ability checks) |
| Email | Resend |
| Marketing pages | `@nuxt/content` v3 (Markdown in `content/`) |

## Quick start

This project uses **Bun** — `bun.lock` is the only lockfile, so install with Bun to get the same
dependency tree as everyone else. Do not use `npm`, `pnpm` or `yarn`; they will generate a second
lockfile and a different tree.

```bash
git clone https://github.com/newtheatre/proscenium.git
cd proscenium
bun install
```

Create a `.env` in the project root (it is gitignored). The minimum to boot locally:

```dotenv
# Required, or the Worker will not boot at all
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
```

`nuxt-auth-utils` generates `NUXT_SESSION_PASSWORD` and appends it to `.env` on first run. The full
list of variables — and the Resend key naming pitfall — is in
[docs/01-getting-started.md](docs/01-getting-started.md) §4–5.

```bash
bun run dev
```

Then open <http://localhost:3000>. The local database starts **empty** — seed it via
Nuxt DevTools → Tasks → `db:seed` (see [docs/01-getting-started.md](docs/01-getting-started.md) §9).

## Documentation

The [`docs/`](docs/) directory is the application's institutional memory — read
[docs/README.md](docs/README.md) first. Highlights:

| Doc | For |
| --- | --- |
| [01 Getting started](docs/01-getting-started.md) | Setup, environment variables, running, seeding |
| [02 Architecture](docs/02-architecture.md) | How the code is laid out and why |
| [03 Domain model](docs/03-domain-model.md) | The schema, table by table |
| [04 Auth & permissions](docs/04-auth-and-permissions.md) | Sessions, roles, the ability system |
| [05 Booking & box office](docs/05-booking-and-box-office.md) | The booking and door flow, end to end |
| [06 Pricing & ticket types](docs/06-pricing-and-ticket-types.md) | The override chain and price snapshots |
| [07 API reference](docs/07-api-reference.md) | Every endpoint, its auth and side effects |
| [08 Operations](docs/08-operations.md) | Deploy, rollback, migrations, incident checklists |
| [09 Known issues](docs/09-known-issues.md) | Current bugs and sharp edges, by severity |
| [Decisions](docs/decisions/) | Architecture decision records (ADRs) |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, the commit and branch conventions, the
database-change workflow, and when to write an ADR. Skim
[docs/09-known-issues.md](docs/09-known-issues.md) before starting — it may already describe what
you are about to hit.

## Project status

An internal project of the Nottingham New Theatre, maintained by the IT Manager. The theatre's
committee turns over yearly, so the docs above exist to make handover possible — keep them current.
