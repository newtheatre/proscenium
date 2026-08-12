# Proscenium documentation

Proscenium is the Nottingham New Theatre's website **and** its box office. One Nuxt 4 application,
deployed to Cloudflare Workers, serving `newtheatre.org.uk`.

This directory is the app's institutional memory. It was built solo and committed directly to
`main`, with no pull requests and no code review, so beyond terse commit messages there is little
record of *why* outside what is written down here. Keep it current: a committee turns over every
year, and the person reading this in August 2027 will not be able to ask you.

## Where to start

**New to the codebase?** Read [01-getting-started](./01-getting-started.md), then
[02-architecture](./02-architecture.md), then [03-domain-model](./03-domain-model.md). That is
enough to find your way around.

**Running the box office on a show night?** [05-booking-and-box-office](./05-booking-and-box-office.md)
§4 is the door workflow. [08-operations](./08-operations.md) has the "it's broken and the house
opens in ten minutes" checklist.

**Taking over as IT Manager?** Read everything, but [09-known-issues](./09-known-issues.md) and the
Gaps section of [08-operations](./08-operations.md) are what you have actually inherited.

## The documents

| | Document | What it covers | Read when |
|---|---|---|---|
| 01 | [Getting started](./01-getting-started.md) | Install, environment variables, dev server, migrations, seeding | Setting up |
| 02 | [Architecture](./02-architecture.md) | Stack, deployment shape, request lifecycle, the constraints Workers and D1 impose | Before making a structural change |
| 03 | [Domain model](./03-domain-model.md) | Every entity, its invariants, and the status lifecycles | Before touching the schema |
| 04 | [Auth and permissions](./04-auth-and-permissions.md) | Sessions, roles, the ability system, the permission matrix | Adding an endpoint |
| 05 | [Booking and box office](./05-booking-and-box-office.md) | The public booking flow, walk-ins, collection, no-shows — end to end | Changing anything a customer touches |
| 06 | [Pricing and ticket types](./06-pricing-and-ticket-types.md) | The override chain, price snapshots, what `pricePaid` actually means | Changing prices or reporting on money |
| 07 | [API reference](./07-api-reference.md) | All 63 endpoints: auth, schemas, responses, side effects | Writing a client, or auditing access |
| 08 | [Operations](./08-operations.md) | Deploy, rollback, migrations, backups, incident checklists, handover | On call |
| 09 | [Known issues](./09-known-issues.md) | Every bug and sharp edge found in the August 2026 audit, with severity | Prioritising work |
| 10 | [Passes — design](./10-passes-design.md) | Season passes and festival passes. **Phase 1 built** (Aug 2026); phases 2–4 outstanding. | Implementing passes |

### Decision records

Significant decisions live in [`decisions/`](./decisions/) as ADRs. Add one whenever you make a
choice a successor would otherwise have to reverse-engineer.

| ADR | Decision |
|---|---|
| [0001](./decisions/0001-record-architecture-decisions.md) | Record architecture decisions |
| [0002](./decisions/0002-passes-as-first-class-entities.md) | Passes are first-class entities that issue ordinary tickets |
| [0003](./decisions/0003-legacy-ticketing-import.md) | Import the legacy Heroku ticketing data rather than starting clean |

## Conventions for this directory

- **British English**, sentence case headings.
- **State what is, not what should be.** Where the code is wrong, document the behaviour and link
  to [09-known-issues](./09-known-issues.md) — do not document the intent as though it were the
  behaviour. A doc that lies is worse than no doc.
- **Numbers with provenance.** If you quote a figure, say where it came from and when.
- **One owner.** The IT Manager owns this directory. Review it at handover, as required by the
  Workspace & Data Retention Policy.

## Status

Written August 2026 by Matt Adcock (IT Manager/Archivist 26/27) against commit `9d17251`, as part of
the legacy ticketing migration. Sections 01, 07 and 08 were drafted from a full read of the source;
02–06 and 09 from an audit of the same. Nothing here has been through code review, because there is
no one else to review it — which is itself the problem this directory exists to reduce.
