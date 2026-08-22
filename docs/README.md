# Proscenium documentation

Proscenium is the Nottingham New Theatre's website **and** its box office. One Nuxt 4 application,
deployed to Cloudflare Workers, serving `newtheatre.org.uk`.

This directory is the app's institutional memory. There is one maintainer and no second reviewer,
so beyond terse commit messages and PR descriptions there is little record of *why* outside what is
written down here. Keep it current: a committee turns over every year, and the person reading this
in August 2027 will not be able to ask you.

**Reasoning lives in [`decisions/`](./decisions/), not in code comments.** A comment states the
constraint and cites the ADR; the ADR carries the argument. See
[CONTRIBUTING.md](../CONTRIBUTING.md) §Comments.

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
| 05 | [Booking and box office](./05-booking-and-box-office.md) | The public booking flow, walk-ins, collection, no-shows: end to end | Changing anything a customer touches |
| 06 | [Pricing and ticket types](./06-pricing-and-ticket-types.md) | The override chain, price snapshots, what `pricePaid` actually means | Changing prices or reporting on money |
| 07 | [API reference](./07-api-reference.md) | Every endpoint: auth, schemas, responses, side effects | Writing a client, or auditing access |
| 08 | [Operations](./08-operations.md) | Deploy, rollback, migrations, backups, incident checklists, handover | On call |
| 09 | [Known issues](./09-known-issues.md) | Every bug and sharp edge found in the August 2026 audit, with severity | Prioritising work |
| 10 | [Passes: design](./10-passes-design.md) | Season passes and festival passes. **Phase 1 built** (Aug 2026); phases 2–4 outstanding. | Implementing passes |
| 11 | [Show night screen: design](./11-show-night-screen-design.md) | The `/foh` screen: scanner and QR, tonight at a glance, emergency, incidents, backstage comms. **Agreed Aug 2026, not built.** | Implementing the show night screen |
| 12 | [Access, staffing and end-of-night: design](./12-access-and-staffing-design.md) | Access needs, the volunteer rota, the end-of-night report. **Its §5 is the programme order for 11, 12 and 13 together.** | Before starting any part of 11, 12 or 13 |
| 13 | [Bar: design](./13-bar-design.md) | The counter till, the stock ledger, Challenge 25, the daily reconciliation. **Agreed Aug 2026, not built.** | Implementing the bar |
| 14 | [Training mode: design](./14-training-mode-design.md) | Sandboxes on the till, Challenge 25 and the door, for people currently being taught them. **Agreed and built Aug 2026**; needs practice targets creating in rehearsal before it does anything. | Working on training mode |

**Documents 11, 12 and 13 are one programme, not three features.** They interleave: the rota gates
the show night screen, the screen hosts the bar, and the end-of-night report aggregates all three.
Read [12-access-and-staffing §5](./12-access-and-staffing-design.md) before starting any of them.

**Document 14 sits on top of that programme and depends on `rehearsal`.** It cannot be built before
the screens it simulates, and it cannot be built before rehearsal ships practice windows.

### Decision records

Significant decisions live in [`decisions/`](./decisions/) as ADRs. Add one whenever you make a
choice a successor would otherwise have to reverse-engineer.

The index, with the template, is in [`decisions/README.md`](./decisions/README.md).

## Conventions for this directory

- **British English**, sentence case headings.
- **State what is, not what should be.** Where the code is wrong, document the behaviour and link
  to [09-known-issues](./09-known-issues.md): do not document the intent as though it were the
  behaviour. A doc that lies is worse than no doc.
- **Numbers with provenance.** If you quote a figure, say where it came from and when.
- **One owner.** The IT Manager owns this directory. Review it at handover, as required by the
  Workspace & Data Retention Policy.

## Status

Written August 2026 by Matt Adcock (IT Manager/Archivist 26/27) as part of the legacy ticketing
migration. Sections 01, 07 and 08 were drafted from a full read of the source; 02–06 and 09 from an
audit of the same. Nothing here has been through code review, because there is no one else to review
it, which is itself the problem this directory exists to reduce.
