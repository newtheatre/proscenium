# Sources

Read on 23 November 2026. Repository files are on branch `next` of newtheatre/proscenium at commit cf7907e1.

## Repository

| Source | Used for |
| --- | --- |
| [Foundations: formats](https://github.com/newtheatre/proscenium/blob/next/docs/specs/foundations/02-formats.md) and its [data-class](https://github.com/newtheatre/proscenium/blob/next/docs/specs/foundations/02-4-data-class-registry.md), [settings](https://github.com/newtheatre/proscenium/blob/next/docs/specs/foundations/02-2-settings-registry.md) and [abilities](https://github.com/newtheatre/proscenium/blob/next/docs/specs/foundations/02-3-abilities-registry.md) registries | Table layout, setting and ability columns, naming rules, the four ways modules talk |
| [Foundations: interface to other modules](https://github.com/newtheatre/proscenium/blob/next/docs/specs/foundations/06-interface-to-other-modules.md) | Lists and `readList`, the id prefix index, reserved module ids, `bar.report` as a later point |
| [The kit guide](https://github.com/newtheatre/proscenium/blob/next/docs/kit/README.md) | Unit of work, `insertSet`, jobs and lanes, tasks, requirements |
| [Core's points](https://github.com/newtheatre/proscenium/blob/next/layers/core/module/points.ts) and [`core.home-figure`](https://github.com/newtheatre/proscenium/blob/next/layers/core/server/points/home-figure.ts) | The shape of an existing figure contract, chart rows and units |
| [Front of house: tonight figure](https://github.com/newtheatre/proscenium/blob/next/layers/front-of-house/server/points/tonight-figure.ts) and [report section](https://github.com/newtheatre/proscenium/blob/next/layers/front-of-house/server/points/report-section.ts) | Prior art: figures read by one module from others, unavailable rather than an error |
| [Finance reports](https://github.com/newtheatre/proscenium/blob/next/layers/finance/server/reports.ts) and [ledger export](https://github.com/newtheatre/proscenium/blob/next/layers/finance/server/api/finance/export.get.ts) | Production statement and CSV conventions; sealed postings only |
| [Front of house schema](https://github.com/newtheatre/proscenium/blob/next/layers/front-of-house/server/db/schema.ts) | `minutes_worked` on assignments, for volunteer hours |
| [Core domain schema](https://github.com/newtheatre/proscenium/blob/next/layers/core/server/db/domain.ts) | `rps` taken by run presets; operating day on performances |
| [Core calendar](https://github.com/newtheatre/proscenium/blob/next/layers/core/server/calendar.ts) | `core.locale.day-start` and `core.locale.time-zone` |
| [Rate limit classes](https://github.com/newtheatre/proscenium/blob/next/layers/core/kit/ratelimit.ts) | The `export` class |
| [Module catalogue](https://github.com/newtheatre/proscenium/blob/next/docs/design-paper/04-2-module-catalogue.md) | The catalogue's five lines on Reports |
| [Roadmap](https://github.com/newtheatre/proscenium/blob/next/docs/design-paper/07-roadmap.md) | Reports in phase 6, wider adoption |
| [Identity: settings and abilities](https://github.com/newtheatre/proscenium/blob/next/docs/specs/identity/07-settings-and-abilities.md) | Preset role keys |
| [Interface: shells and navigation](https://github.com/newtheatre/proscenium/blob/next/docs/specs/interface-and-wireframes/05-1-shells-and-navigation.md) | Reports last in the console's group order |
| [Bar: interface](https://github.com/newtheatre/proscenium/blob/next/docs/specs/bar/05-interface-to-other-modules.md), [Membership: stories](https://github.com/newtheatre/proscenium/blob/next/docs/specs/membership/08-stories.md) | `bar.report`, `bar.report.view`, MEM-50 |
| [Spaces and room booking: overview](https://github.com/newtheatre/proscenium/blob/next/docs/specs/spaces-and-room-booking/01-overview.md) and data model | The second-round model of tone and depth |

## Docs and files

| Source | Used for |
| --- | --- |
| [Proscenium: the plan beyond what is built](https://claude.ai/artifact/Ncea8wJY5z2sdaA89cigQk) | Third-round boundaries: Reports is a module plus a kit point |
| Third-round brief, `/mnt/project-files/third-round-specs/brief.md` | Format and rules |
| The figures contract, `/mnt/project-files/third-round-specs/reports-measure-contract.md` | The short version of tab 2's point, written for the other threads |

## Agreed with other threads on 23 November 2026

Governance (handover section, pins, its four figures); Training (its figures and the quiz ratio); Fundraising (its figures); Productions (reading Box office's figures through `readMeasure`, its licensing return); Rehearsals (aggregate only, no per-person figure); Programme planning ("occupancy" stays its word, `core.room-use` is core's); Invoices and exports (the line between statistics and accounting exports; reuse of the cadence); Practice mode (practice data never in real tables); Integration (prefixes, the service name, the words ruling).
