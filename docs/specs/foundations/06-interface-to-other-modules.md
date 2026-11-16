# 4. Interface to other modules

## What foundations offers every module

Foundations has no feature of its own to offer. What it offers is **the kit**: the small set of functions every module is written with, imported from `#kit`. A module that reaches the database, a queue, a secret or another module by any other route fails a lint. The formats behind these functions are in the format tabs; this part is the contract.

## The kit

| Function | What it does | Rules it carries |
| --- | --- | --- |
| `defineModule(manifest)` | Declares a module | Module manifest tab |
| `defineTable(name, columns, options)` and `col.*` | Declares a table with the class of every column | Data-class registry tab |
| `defineRoute({ ability, record, rateLimit, protect, idempotent, input }, handler)` | Declares an API route. `ability` is a declared ability or `'signed-in'`; a route for anyone says `public: true` in place of `ability`, and there is no `ability: 'public'`. Checks sign-in and permission, then input, rate limit and challenge, before the handler runs; opens the unit; shapes refusals | R1, R2, R6 |
| `can(actor, ability, record?)` | The one permission check | R1 |
| `unit` (given to handlers and jobs): `add`, `expect`, `audit`, `announce`, `afterCommit` | The one way to write | U1 to U6 |
| `refuse(code, reason, { remedy, fields })` | The one way to say no | R2 |
| `useSetting(key)` on the server; `usePublicSettings()` in components (settings of audience public only); `:setting{name="..."}` in content | Reads a setting, typed from the registry | R3 to R5 |
| `fact(name, actor, record?)` | Reads a fact another module declared | Abilities registry tab |
| `usePoint(name)` | Reads the contributions to a point (`point()` is the manifest helper that declares one) | Module manifest tab |
| `requirements.options`, `.describe`, `.check`, `.holder` | Asks the sources of `core.requirement` whether people meet stored conditions | Formats tab, Requirements |
| `enqueue(job, payload, { dedupeKey, delay })` | Queues a job, inside the unit so it is queued only if the change commits | J1 to J7 |
| `externalCall(name, { reference, key?, attempt?, call })` | The one way to call an outside service that cannot be undone; the call is declared in the manifest's `calls` | X1 to X4 |
| `credential(name)` | Reads a secret or a stored credential the module declared | Never logs, never returns to a browser |
| `signing.sign`, `.verify`, `.publicKeys` | Signs and checks under a purpose the module declared; the kit owns the keys | Formats tab, signing service (F-37) |
| `files`, `cache`, `live` | Thin wrappers over the file store, the cache and live screens. `files` is specified by workstream 3, `live` by workstream 6. | A module never holds a binding |
| `now()`, `today()`, `localDate()` | The clock, in the site's time zone, replaceable in tests | R7 |
| `log` | Structured logging with the request id; personal columns are stripped by class |  |

Services of another module are imported from `#modules/<id>` and are only what that module exports from `server/services.ts`. Importing any other file of another module fails a lint, and importing a module not listed in `requires` fails the build.

## Points foundations declares

A point is a named place where modules contribute. These are foundations' own.

| Point | Kind | A contribution is | Used by |
| --- | --- | --- | --- |
| `core.navigation` | data | A link with its menu, group, label, icon and the ability that shows it | The shells (workstream 6 defines groups) |
| `core.setup-step` | data | A step in the setup checklist: label, how to tell it is done, where to do it | The Setup screen |
| `core.health-check` | code | A named check returning ok, warning or failing, with a sentence and a remedy | The Health screen |
| `core.erasure-handler` | code | For tables whose erasure cannot be expressed by column behaviours: statements to add to the erasure unit | Identity's erasure flow |
| `core.record-resolver` | code | Given a record type and id: its label, its address, its parent record | Audit search, notifications, links |
| `core.privacy-record` | data | A plain-words entry for the generated record of processing: what is held, why, how long | The privacy page generator |
| `core.requirement` | code | A source that judges whether a person meets a stored condition at an instant: `options`, `describe`, `check`, optional `holder` | Any host, through `requirements.options`, `.describe`, `.check` and `.holder` |

## Index of every `core.*` and `forms.*` name

Foundations keeps the one index so two workstreams cannot claim the same name. The owning workstream's document is the authority for what each means.

| Owner | Points | Record types | Facts |
| --- | --- | --- | --- |
| Foundations (1) | `core.navigation`, `core.setup-step`, `core.health-check`, `core.erasure-handler`, `core.record-resolver`, `core.privacy-record`, `core.requirement` | `core.module`, `core.setting`, `core.job`, `core.credential` | none |
| Identity (2) | `core.sign-in-method`, `core.erasure-hold`, `core.merge-handler`, `core.export-contributor`, core.access-purpose | `core.account`, `core.role`, `core.grant`, `core.data-request` | `core.member`, core.access-scheme |
| Core domain (3), in `core` and in its second module `public-site` | `core.change-impact`, `core.change-guard`, `core.delete-guard`, `core.space-busy`, `core.booking-action`, `core.notification-channel`, `core.notification-type`, `core.notification-topic`, `core.holiday-feed`, `core.file-access`, `core.file-slot`, `core.public-component`, `core.vocabulary` | `core.season`, `core.production`, `core.performance`, `core.venue`, `core.space`, `core.file`, `core.vocabulary`, `core.branding` | `core.production-team` |
| Forms (5) | `forms.slot`, `forms.field-type`, `forms.bindable`, `forms.outcome-action`, `forms.template` | `forms.form`, `forms.response` | `forms.submitter`, `forms.co-author`, `forms.reviewer` |
| Interface (6) | `core.navigation-group`, `core.home-card`, `core.record-tab`, `core.account-section`, `core.search-source`, `core.quick-action`, `core.help-page`, `core.on-shift-bar`, `core.tonight-tile` | none | none |

**The access scheme (Identity, 16 November 2026).** A named part of the core, not a module; its names are indexed here and defined in the Identity Doc, parts 2, 3, 4 and 6. Tables `core_access_profiles` (`keyed by account, no id`) and `core_access_shares` (keyed by account and purpose, no id). The point `core.access-purpose` is a data point: a module declares a purpose with an id, a side, a label and explanation, an ability, the entries it uses and an optional record type. The vocabulary `core.access-need` is declared through `core.vocabulary`. The fact `core.access-scheme` is not a standing and has no `holders`, which the fact format allows; the value `core.access-scheme.companions` is offered through `core.requirement`. Abilities: `core.access-scheme.read`, `core.access-scheme.review`, `core.access-profile.read`, `core.emergency-contact.read`. Settings: the group `core.access-scheme.*` and `core.emergency-contacts.keep-after-standing`; these are separate from `core.access.fresh-within`, which is about permissions. The public page `/access` is a theatre content page holding Identity's component `CoreAccessApplication`, so it is deliberately not a reserved address prefix.

`core.production-section` was withdrawn on 16 November: `core.record-tab` is the one way to add to a record page. `core.account-section` is defined once, by the interface.

Workstream 4 owns three modules, `box-office`, `payments` and `finance`, and declares its names under `box-office.*`, `payments.*` and `finance.*` in its own document; it needs no row here. The same is true of every second-round module, whose names are listed after the prefix table below.

## Index of id prefixes

Every id is `<prefix>_<26 characters>`. Prefixes are unique across the system, so foundations keeps the list. A table keyed by its own columns (a join table, or one keyed by a name) has no id and needs no prefix. Each prefix is followed by its table's name without the module's table prefix. Ids are time-sorted unless the Random column lists them.

| Owner, module and table prefix | Time-sorted | Random | Keyed by own columns |
| --- | --- | --- | --- |
| Foundations, `core_` | `evt` events, `job` jobs, `aud` audit, `ext` external\_calls, `sch` setting\_changes, `sgk` signing\_keys | none | modules, settings, migrations, task\_runs, credentials, idempotency\_keys, guard |
| Identity, `core_` | `acc` accounts, `aem` account\_emails, `pky` passkeys, `fid` federated\_identities, `rol` roles, `gra` grants, `mrg` account\_merges, `mrgi` account\_merge\_items, `dreq` data\_requests, `emc` emergency\_contacts | `ses` sessions, `tok` account\_tokens, `pch` passkey\_challenges, `rcc` recovery\_codes | role\_abilities, fact\_abilities, access\_profiles, access\_shares |
| Core domain, `core_` | `sea` seasons, `prd` productions, `crd` production\_credits, `perf` performances, `ven` venues, `spc` spaces, `pla` place\_access, `clo` closures, `trm` terms, `ntf` notifications, `ndl` notification\_deliveries, `inb` inbox\_items, `ntd` notification\_template\_drafts, `ntt` notification\_templates, `psh` push\_subscriptions, `whk` webhooks, `whd` webhook\_deliveries | `fil` files | production\_slugs, production\_advisories, performance\_access, vocabularies, sender\_identities, notification\_routing, notification\_preferences, email\_suppressions |
| Interface, `core_` | `svw` saved\_views | none | preferences, navigation\_overrides |
| Box office, `box_office_` | `sale` performance\_sales, `band` bands, `tty` ticket\_types, `prc` prices, `pool` pools, `hold` holds, `clm` claims, `ord` orders, `orl` order\_lines, `tkt` tickets, `scan` scans, `can` cancellations, `prm` promo\_codes, `prr` promo\_redemptions, `pty` pass\_types, `pass` passes, `psr` pass\_redemptions, `comp` comp\_requests, `wle` waitlist\_entries, `plan` seating\_plans, `pls` plan\_seats, `pfs` performance\_seats | none |  |
| Payments, `payments_` | `ppa` provider\_accounts, `rdr` readers, `till` sessions, `pay` intents, `pip` intent\_parts, `att` attempts, `ate` attempt\_events, `rfd` refunds, `pwe` webhook\_events | none |  |
| Finance, `finance_` | `lac` accounts, `post` postings, `led` entries, `seal` seals, `fpe` periods, `pcl` period\_closes, `tax` tax\_codes | none |  |
| Forms, `forms_` | `frm` forms, `fver` versions, `ffld` fields, `fplc` placements, `fres` responses, `f``stg` stage\_history, `fasg` review\_assignments, `frev` reviews, `fmsg` messages, `frun` action\_runs, `ftpl` templates, `fcoa` response\_authors (after the first release) | `finv` invitations |  |
| Front of house, `front_of_house_` | `dty` duties, `rtp` rota\_templates, `shf` shifts, `asg` assignments, `ckl` checklists, `cki` checklist\_items, `ckr` checklist\_runs, `cke` checklist\_entries, `inc` incidents, `inp` incident\_people, `ina` incident\_actions, `inu` incident\_updates, `nrp` night\_reports, `nrn` night\_report\_notes, `tmg` timings, `emg` emergency\_cards | none | rota\_template\_lines |
| Spaces, `spaces_` | `bkb` bookables, `bpu` purposes, `bks` booking\_series, `bkg` bookings, `bke` booking\_events | none | opening\_hours, bookable\_purposes |
| Bar, `bar_` | `bout` outlets, `bcat` categories, `bprd` products, `bvar` variants, `bpls` price\_lists, `bprc` prices, `bsti` stock\_items, `bloc` stock\_locations, `brcp` recipe\_lines, `bage` age\_checks, `bmov` stock\_movements, `bdel` deliveries, `bdll` delivery\_lines, `bstk` stocktakes, `bskl` stocktake\_lines, `bopn` openings, `bsal` sales, `bsln` sale\_lines, `brev` sale\_reversals, `btab` tabs, `brrv` register\_reviews | none | stock\_levels |
| Training, `training_` | `tcrs` courses, `tver` course\_versions, `tstp` course\_steps, `tcmp` competencies, `tses` sessions, `tplc` session\_places, `tsof` sign\_offs, `trec` records, `tevd` evidence | none | course\_trainers and two join tables |
| Membership, `membership_` | `msch` schemes, `mshp` memberships, `mbr` members, `mver` verifications, `mvl` verification lists, `mve` list entries, `mlo` length\_options | none |  |
| Membership fees, `membership_fees_` | `mfp` prices, `mfc` charges | none |  |
| Communications, `communications_` | `cml` lists, `cwd` consent\_wordings, `csub` subscriptions, `ccon` consent\_records, `cam` campaigns, `crcp` campaign\_recipients, `cmt` mailing\_templates, `cimp` imports, `cseg` segments (later release) | none |  |

Not available: every prefix above, and any prefix starting with `x`, which belongs to a theatre's own modules. Withdrawn and free again: `psl`, `adv`, `pfa`, `per`, fdr, fans, fopt, fpar (the four forms tables response\_drafts, answers, option\_counts and participation are keyed by their own columns).

**An id is never a secret.** Ids appear in logs, audit rows, event payloads and webhooks. Anything that grants access by being known (an invitation link, a resume link, a scan code, a sign-in link) is a separate random token on the row, stored hashed, and never the row's id. `random: true` only hides the moment of creation.

## Names declared by second-round modules

Each module's own document is the authority; these are listed so that nobody claims a name twice.

| Module | Requires and uses | Points | Facts | Record types |
| --- | --- | --- | --- | --- |
| `front-of-house` | as its document | `front-of-house.tonight-figure`, `front-of-house.report-section` | `front-of-house.on-shift` (on core.performance, standing), `front-of-house.leading-shift`, `front-of-house.rostered` (standing) | shift, assignment, incident, night-report, checklist-run |
| `spaces` | as its document | none | none | bookable (parent core.space, optional), booking, purpose |
| `bar` | requires payments, finance; uses front-of-house, membership, training | `bar.report` (later release) | none | outlet, opening, sale, product, stock-item, stocktake, tab (parent bar.outlet, optional) |
| `training` | as its document | none | `training.competent`, `training.course-trainer` (both `pin: true`) | course and others as its document |
| `membership` | requires forms; uses communications | `membership.verifier`, `membership.charge` | `membership.holder` (standing), `membership.supporter`, `membership.scheme-holder`, `membership.voter` | scheme, membership, verification-list |
| `membership-fees` | requires membership, payments, finance | none | none | price, charge |
| `communications` | requires core; uses box-office, forms, membership, front-of-house | as its document, including `communications.audience-source`, to which the core never contributes | none | as its document |

Requirement sources so far: `training`, `membership`, and `fact` (any declared fact). No module declares a point of its own for a per-person condition; `front-of-house.eligibility`, `box-office.eligibility`, `bar.price-eligibility` and `spaces.booking-rule` were withdrawn in favour of `core.requirement`. Membership's secret is `MEMBERSHIP_LIST_KEY`. Box office added the deliverable event `box-office.order.reserved`, the point `payments.desk-basket` and the code point `box-office.checkout-consent`. Practice mode (a live screen run on data that is not real) is a later story led by the interface.

Other platform names foundations added in the second round: the queue binding `EMAIL_EVENTS`, the rate-limit class `presented-value`, and the reserved address prefix`es /mailing and /forms. The one list of reserved prefixes is in the Module manifest tab`.

## Events foundations announces

| Event | When | Payload | Internal |
| --- | --- | --- | --- |
| `core.module.enabled`, `core.module.disabled` | A module is switched | module id | yes |
| `core.setting.changed` | A setting changes | key (never the value of a sensitive setting) | yes |
| `core.release.applied` | An update's migrations finish | release version | yes |
| `core.job.died` | A job uses up its attempts | job name and id | yes |

All four are internal: they are about the running of the site, so they are never sent to a theatre's webhooks. There is no event named `core.module.switched`.

## What foundations needs from the others

| From | Need |
| --- | --- |
| Identity (2) | The actor for a request (account, grants, standing), given to `can`; a strong session and a fresh sign-in where an ability needs them; the erasure flow that reads the data-class registry; the Owner and administrator preset roles that foundations' abilities suggest as holders; `holdersOf`, which the fact format now supports |
| Core domain (3) | The file store behind `files`; the notification service that the health screen uses to tell administrators about dead jobs and failed updates; branding and vocabulary for refusal pages; the task `core.email-events` behind the `EMAIL_EVENTS` queue |
| Interface (6) | The console shell that hosts foundations' screens; the standard refusal, empty and loading components; the group and address pattern for foundations' screens |

## Stability promise

The kit, the manifest format and the registries are versioned together as `manifest: 1`. Within a major version of Proscenium nothing in them is removed or changes meaning. A theatre's own module written against `manifest: 1` keeps working until the next major version, and the release notes of a major version list every change with what to do.
