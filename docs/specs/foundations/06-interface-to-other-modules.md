# 4. Interface to other modules

## What foundations offers every module

Foundations has no feature of its own to offer. What it offers is **the kit**: the small set of functions every module is written with, imported from `#kit`. A module that reaches the database, a queue, a secret or another module by any other route fails a lint. The formats behind these functions are in the format tabs; this part is the contract.

## The kit

| Function | What it does | Rules it carries |
| --- | --- | --- |
| `defineModule(manifest)` | Declares a module | Module manifest tab |
| `defineTable(name, columns, options)` and `col.*` | Declares a table with the class of every column | Data-class registry tab |
| `defineRoute({ ability, record, public, rateLimit, protect, idempotent, input }, handler)` | Declares an API route. Checks sign-in, permission, input, rate limit and challenge before the handler runs; opens the unit; shapes refusals | R1, R2, R6 |
| `can(actor, ability, record?)` | The one permission check | R1 |
| `unit` (given to handlers and jobs): `add`, `expect`, `audit`, `announce`, `afterCommit` | The one way to write | U1 to U6 |
| `refuse(code, reason, { remedy, fields })` | The one way to say no | R2 |
| `setting(key)` | Reads a setting, typed from the registry | R3 to R5 |
| `fact(name, actor, record?)` | Reads a fact another module declared | Abilities registry tab |
| `point(name)` | Reads the contributions to a point | Module manifest tab |
| `enqueue(job, payload, { dedupeKey, delay })` | Queues a job, inside the unit so it is queued only if the change commits | J1 to J7 |
| `externalCall({ attempt, call, outcome })` | The one way to call an outside service that cannot be undone | X1 to X4 |
| `credential(name)` | Reads a secret or a stored credential the module declared | Never logs, never returns to a browser |
| `files`, `cache`, `live` | Thin wrappers over the file store, the cache and live screens. `files` is specified by workstream 3, `live` by workstream 6. | A module never holds a binding |
| `now()`, `today()`, `localDate()` | The clock, in the site's time zone, replaceable in tests | R7 |
| `log` | Structured logging with the request id; personal columns are stripped by class |  |

Services of another module are imported from `#modules/<id>` and are only what that module exports from `server/services.ts`. Importing any other file of another module fails a lint, and importing a module not listed in `requires` fails the build.

## Points foundations declares

A point is a named place where modules contribute. These are foundations' own.

| Point | Kind | A contribution is | Used by |
| --- | --- | --- | --- |
| `core.navigation` | data | A link with its shell, group, label, icon and the ability that shows it | The shells (workstream 6 defines groups) |
| `core.setup-step` | data | A step in the setup checklist: label, how to tell it is done, where to do it | The Setup screen |
| `core.health-check` | code | A named check returning ok, warning or failing, with a sentence and a remedy | The Health screen |
| `core.erasure-handler` | code | For tables whose erasure cannot be expressed by column behaviours: statements to add to the erasure unit | Identity's erasure flow |
| `core.record-resolver` | code | Given a record type and id: its label, its address, its parent record | Audit search, notifications, links |
| `core.privacy-record` | data | A plain-words entry for the generated record of processing: what is held, why, how long | The privacy page generator |

## Index of every `core.*` and `forms.*` name

Foundations keeps the one index so two workstreams cannot claim the same name. The owning workstream's document is the authority for what each means.

| Owner | Points | Record types | Facts |
| --- | --- | --- | --- |
| Foundations (1) | `core.navigation`, `core.setup-step`, `core.health-check`, `core.erasure-handler`, `core.record-resolver`, `core.privacy-record` | `core.module`, `core.setting`, `core.job`, `core.credential` | none |
| Identity (2) | `core.sign-in-method`, `core.erasure-hold`, `core.merge-handler`, `core.export-contributor` | `core.account`, `core.role`, `core.grant`, `core.data-request` | `core.member` |
| Core domain (3) | `core.change-impact`, `core.change-guard`, `core.delete-guard`, `core.space-busy`, `core.booking-action`, `core.production-section`, `core.notification-channel`, `core.notification-type`, `core.notification-topic`, `core.holiday-feed`, `core.file-access`, `core.file-slot`, `core.public-component`, `core.vocabulary` | `core.season`, `core.production`, `core.performance`, `core.venue`, `core.space`, `core.file`, `core.vocabulary`, `core.branding` | as declared in its document |
| Forms (5) | `forms.slot`, `forms.field-type`, `forms.bindable`, `forms.outcome-action`, `forms.template` | as declared in its document | none |
| Interface (6) | `core.navigation-group`, `core.home-card`, `core.record-tab`, `core.account-section`, `core.search-source`, `core.quick-action` | none | none |

Box office (4) declares its names under `box-office.*` and needs no entry here.

## Index of id prefixes

Every id is `<prefix>_<26 characters>` (question 6, as amended). Prefixes are unique across the system, so foundations keeps the list. A table keyed by its own columns (a join table, or one keyed by a name) has no id and needs no prefix.

| Owner | Time-sorted | Random | Notes |
| --- | --- | --- | --- |
| Foundations (1) | `evt` core\_events, `job` core\_jobs, `aud` core\_audit, `ext` core\_external\_calls, `sch` core\_setting\_changes | none | core\_modules, core\_settings, core\_migrations, core\_task\_runs, core\_credentials, core\_idempotency\_keys and core\_guard are keyed by their own columns |
| Identity (2) | `acc` core\_accounts, `aem` core\_account\_emails, `pky` core\_passkeys, `fid` core\_federated\_identities, `rol` core\_roles, `gra` core\_grants, `mrg` core\_account\_merges, `mrgi` core\_account\_merge\_items, `dreq` core\_data\_requests, `emc` core\_emergency\_contacts, `apr` core\_access\_profiles | `ses` core\_sessions, `tok` core\_account\_tokens, `pch` core\_passkey\_challenges, `rcc` core\_recovery\_codes | core\_role\_abilities and core\_fact\_abilities are keyed by their two columns |
| Core domain (3), box office (4), forms (5) | to come | to come |  |

**Core domain (3), received and accepted.** Time-sorted: `sea` core\_seasons, `prd` core\_productions, `crd` core\_production\_credits, `perf` core\_performances, `ven` core\_venues, `spc` core\_spaces, `pla` core\_place\_access, `clo` core\_closures, `trm` core\_terms, `ntf` core\_notifications, `ndl` core\_notification\_deliveries, `inb` core\_inbox\_items, `ntd` core\_notification\_template\_drafts, `ntt` core\_notification\_templates, `psh` core\_push\_subscriptions, `whk` core\_webhooks, `whd` core\_webhook\_deliveries. Random: `fil` core\_files. Keyed by their own columns, so no prefix: core\_production\_slugs, core\_production\_advisories, core\_performance\_access, core\_vocabularies, core\_sender\_identities, core\_notification\_routing, core\_notification\_preferences, core\_email\_suppressions. The prefixes `psl`, `adv` and `pfa` were withdrawn on 16 November and are free.

**Box office, payments and finance (4), received and accepted.** All time-sorted; scan codes and link tokens are separate random values. Box office: `sale` performance\_sales, `band` bands, `tty` ticket\_types, `prc` prices, `pool` pools, `hold` holds, `clm` claims, `ord` orders, `orl` order\_lines, `tkt` tickets, `scan` scans, `can` cancellations, `prm` promo\_codes, `prr` promo\_redemptions, `pty` pass\_types, `pass` passes, `psr` pass\_redemptions, `comp` comp\_requests, `wle` waitlist\_entries, `plan` seating\_plans, `pls` plan\_seats, `pfs` performance\_seats. Payments: `ppa` provider\_accounts, `rdr` readers, `till` sessions, `pay` intents, `att` attempts, `ate` attempt\_events, `rfd` refunds, `pwe` webhook\_events. Finance: `lac` accounts, `post` postings, `led` entries, `seal` seals, `fpe` periods (changed from `per`, which read too like `perf`), `pcl` period\_closes, `tax` tax\_codes.

Added later by box office: `pip` payments\_intent\_parts (a payment intent may have several parts, each with its own owning module and record).

Added later by the form builder: `fcoa` forms\_response\_authors (the co-author list of a shared draft, behind the fact forms.co-author). The table arrives after the first release.

**Front of house (second round), received and accepted.** Module `front-of-house`, tables `front_of_house_`. Time-sorted: `dty` duties, `rtp` rota\_templates, `shf` shifts, `asg` assignments, `ckl` checklists, `cki` checklist\_items, `ckr` checklist\_runs, `cke` checklist\_entries, `inc` incidents, `inp` incident\_people, `ina` incident\_actions, `inu` incident\_updates, `nrp` night\_reports, `nrn` night\_report\_notes, `tmg` timings, `emg` emergency\_cards. Keyed by its own columns: rota\_template\_lines. Its facts, points and record types are declared in its own document under `front-of-house.*`.

**Forms (5), received and accepted.** Time-sorted: `frm` forms\_forms, `fver` forms\_versions, `ffld` forms\_fields, `fplc` forms\_placements, `fres` forms\_responses, `fans` forms\_answers, `fopt` forms\_option\_counts, `fstg` forms\_stage\_history, `fasg` forms\_review\_assignments, `frev` forms\_reviews, `fmsg` forms\_messages, `fpar` forms\_participation, `frun` forms\_action\_runs, `ftpl` forms\_templates. Random: `finv` forms\_invitations, `fdr` forms\_response\_drafts.

**An id is never a secret.** Ids appear in logs, audit rows, event payloads and webhooks. Anything that grants access by being known (an invitation link, a resume link, a scan code, a sign-in link) is a separate random token on the row, stored hashed, and never the row's id. `random: true` only hides the moment of creation.

Reserved so far: every prefix above, and any prefix starting with `x`, which belongs to a theatre's own modules.

## Events foundations announces

| Event | When | Payload |
| --- | --- | --- |
| `core.module.enabled`, `core.module.disabled` | A module is switched | module id |
| `core.setting.changed` | A setting changes | key (never the value of a sensitive setting) |
| `core.release.applied` | An update's migrations finish | release version |
| `core.job.died` | A job uses up its attempts | job name and id |

## What foundations needs from the others

| From | Need |
| --- | --- |
| Identity (2) | The actor for a request (account, grants, standing), given to `can`; fresh sign-in for abilities marked `fresh`; the erasure flow that reads the data-class registry; the Owner role that foundations' high-risk abilities default to |
| Core domain (3) | The file store behind `files`; the notification service that the health screen uses to tell administrators about dead jobs and failed updates; branding and vocabulary for refusal pages |
| Interface (6) | The console shell that hosts foundations' screens; the standard refusal, empty and loading components |

## Stability promise

The kit, the manifest format and the registries are versioned together as `manifest: 1`. Within a major version of Proscenium nothing in them is removed or changes meaning. A theatre's own module written against `manifest: 1` keeps working until the next major version, and the release notes of a major version list every change with what to do.
