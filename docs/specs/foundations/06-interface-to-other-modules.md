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

**Added to the kit for account merges (pull request 54, 16 November 2026).** `inAccountScope(column, account)`, `accountScope(account)`, `accountScopeIds(accountId)`, `canonicalAccount(accountId)` and `exactAccount(column, accountId)` are how a module compares an account column; the signatures and the rule that nothing else may compare one are in the Data-class registry tab, "How a merge scales". A job answers "not yet" with `job.defer(code)`, counted in `core_jobs.deferrals` and never as a failed attempt. A merge handler lists a row it takes out of use through the kit's set-aside helper, with `onClose` of `'delete'` or `'keep'`.

## Lists: defineList and readList

Added 16 November 2026 for the list design Matt accepted (Interface Doc: Page conventions, List; part 4, Lists). The page behaviour is Interface's; the declaration and the server reader are the kit's, and foundations owns them.

**One declaration in two parts (settled with the interface build, 16 November 2026); this prevails over the sketch below where they differ.** The shared part is pure and holds no SQL: `defineList` itself, its validation (reserved keys, sort and view references), the address codec that parses and serialises each filter kind, the types, and everything the page needs (labels, option labels, date presets, which columns are hidden, always on or card columns, which sort a heading names) beside each filter's `kind`, `values`, `ability` and whether it is a child filter. It lives in the kit at `layers/core/shared/list.ts`; the interface build writes it, and a change to its format passes through this Doc like any other kit format. The server part binds each key to the database and is declared in the module's server folder, because a shared file may not import the schema: `defineListSource(list, { table, filters, sorts, search })` gives each filter its column or child subquery, each sort its `columns` with `index` or `bounded`, and each searched field its column. It is typed against the declaration, so a filter, sort or searched field with no binding, or a binding for a key the declaration lacks, does not compile. The route calls `readList(event, source)`. Index names, column objects and subqueries therefore never reach the browser.

```ts
// shared/lists/<name>.ts in the module: read by the page and by the data route.
export const orders = defineList('box-office.orders', {
  filters,   // key -> { kind, values?, ability?, child? }
  sorts,     // key -> { columns, index }  or  { columns, bounded: n }
  columns,   // key -> { field, ability?, hidden? }
  search,    // extras: further fields and children the search also covers
  views,     // built-in views: name -> { filters, sort, order }
  subRows,   // optional child rows shown under a row
})

// In the data route. The one way a route reads a list's address.
readList(event, list): Promise<ListRead>

interface ListRead {
  filters: Record<string, unknown>        // validated, only those the viewer may use
  dropped: string[]                       // filter keys left out because the viewer lacks the ability
  words: string[]                         // the search words, folded
  sort: { key: string, order: 'asc' | 'desc' }
  view: string | null
  page: number
  size: number
  where(table): SQL                       // filters and search as one condition
  orderBy(table): SQL                     // the sort, with the id as the last key
  limit: number
  offset: number
}
```

Rules:

- **L1. Every key is checked against the declaration.** An unknown key, value, sort or view is refused with the standard refusal body, code `core.list.unknown`, naming the key. `q`, `sort`, `order`, `page`, `size` and `view` are reserved, and `defineList` refuses a filter that uses one of them.
- **L2. A filter whose ability the viewer lacks is dropped, not refused,** and its key is returned in `dropped` so the page can remove the chip. Dropping a filter never shows a row the viewer could not already see: a filter only narrows, and what the viewer may see at all is the route's own ability check, which `readList` does not replace.
- **L3. The id is always the last sort key,** so pages never shuffle. A sort is declared with the index that answers it, and the conformance check refuses a sort with no index beginning with its columns unless the sort declares `bounded: n`, a scan the list's own filters hold to at most n rows.
- **L4. A child filter or child search is a subquery,** never a list of ids read first (rule U4 and the chunk of 90 apply as everywhere). An account filter goes through `inAccountScope`.
- **L5. Pages are by offset, and bounded.** `size` is 25 (the default), 50 or 100; `page` times `size` may not pass 10,000 rows, and beyond that the route refuses with `core.list.too-deep` and the page asks the person to narrow the list. An export is a job, not a deep page.
- **L6. `view=` is a built-in view's name now.** A saved view's id (prefix `svw`) is later, and resolves the same way. Keys in the address override the view's.
- **L7. Date presets are relative** and are worked out in the theatre's days (`core.locale.time-zone`) on the server at the time of the request, never stored as dates.

**Search.** `q` is on for every list. What the person gets is Interface's contract: every text field of the list, shown or hidden, plus the declaration's extras and children; case and accent insensitive; any part of a word; every word must match; a field the viewer may not see is not searched. The formats set four limits on it. A column that is encrypted is never searched, because its text is not in the database. A column of class special is never searched by a list; it is reached only through its own audited service. A personal column is searched only under the ability that shows it, and a search that covers one under an ability with `audit: 'read'` is audited as a read. An erased value is gone from search in the same unit as the erasure, so any folded copy of a column is declared with the column and erased with it.

How the search is answered is the kit's, behind `where()`, and was open until proof P-LIST-1 passed; the paragraphs after this one give the result and prevail. The question was this: accent-insensitive matching of any part of a word cannot use an ordinary index in D1, so the choice lies between a folded copy kept beside each searched column and a full-text index with trigrams. Proof P-LIST-1 decides it: 100,000 rows, three words, on a real D1 database, measuring rows read and time for both. The proof also asks whether the mechanism can name, for each row, the column that matched: the page shows it when the match was in a hidden column ("Matches season: Autumn 2026"), and drops that line if the winning mechanism cannot. Until it passes, a module writes nothing that depends on the mechanism, and no module writes a LIKE of its own to search a list. A prefix lookup on an indexed column that is not a search (finding a free slug) is not caught by this.

**Search mechanism, decided by proof P-LIST-1 (passed 16 November 2026 on a real D1 database of 100,000 rows; write-up in the project files at kit-build/p-list-1/result.md).** Search is answered from a full-text index with trigrams, one per searched table. With three words it read 120 to 1,261 rows in 1 to 5 ms, where folded copies read every row for a count and up to 62,603 rows (213 ms) for a page. The rules:

- **S1. The kit owns the index.** `defineListSource`'s `search` names the searched columns. For each searched table the kit generates a virtual table named `<table>_search` (FTS5, trigram tokenizer, diacritics removed, content taken from the table), triggers on the searched columns only, and the secure-delete setting, as migration SQL, because Drizzle cannot express them; a conformance check compares what is generated with what is declared. A search table is not a module table: it has no id prefix, no data-class declaration and no entry in a manifest, and the registry's readers pass over it.
- **S2. The schema check refuses a searched column that is encrypted or of class special.** A field the viewer may not see is left out of that request's search by a column filter, so it is neither matched nor revealed by a count.
- **S3. A word of three letters or more is matched through the index;** every word must match. A shorter word cannot use the index and is ignored altogether, so matching never behaves in two ways (Interface's choice, 16 November 2026); the answer lists the words left out in ignoredWords, so the page can say so. A search made only of words under three letters is not run: the list is returned unsearched with `searchTooShort: true` in the answer, and the page shows "Type at least three letters to search" under the box.
- **S4. Erasure needs nothing more.** The trigger rewrites the index inside the statement that erases the column, and secure-delete removes the old trigrams at once instead of at a later merge. The kit creates every search index with it on, and the health check reports an index without it.
- **S5. The matched column is named by `readList`,** which compares the page's rows in the Worker with the same fold the index uses, for the fields the viewer may see. The answer carries, per row, the key of the first hidden field that matched.
- **S6. A child search keeps the parent when a child row matches,** by a subquery on the child's own search table.
- **S7. Search does not rank.** The list's sort orders the matches.
- **S8. Costs a module should know.** About 30 MB for 100,000 rows of six fields; changing a searched field writes 3 rows instead of 1, and a field that is not searched costs nothing more. A newly searched column on an existing table is filled by the index's rebuild, which the kit runs as job `core.search-rebuild` after the migration.
- **S9. A database with a search index cannot be exported in the form D1 imports.** Cloudflare's database history, which is what a theatre relies on in place of backups, is unaffected. Moving a theatre to another database by export and import means dropping the search indexes first and running `core.search-rebuild` after; the Upstream merges tab says so beside the note on backups.

**S10. A search index is derived data and part of its table.** It can always be dropped and rebuilt from the table by `core.search-rebuild`, and nothing is lost by dropping it. The migration runner, the check that every table is declared and the check that refuses rebuilding an append-only table all pass over a `<table>_search` virtual table and its shadow tables (`_data`, `_idx`, `_docsize`, `_config`), recognising them only by a declared search source; an undeclared one is still refused. The index of an append-only table follows its table: the one update the append-only trigger permits for erasure rewrites the index in the same statement, and nothing else writes to it. Retention and deletion reach the index through the delete trigger.

**As built (kit pull request 96, 16 November 2026); this prevails over the sketch above.**

- `defineListSource(list, { table, filters, sorts, search })` binds every key. A filter is `{ column }` or `{ where: value => SQL }`, and a grouped filter always uses `where`. A sort is `{ columns, index }`, where the index is checked to begin with those columns, or `{ columns, bounded: n }`. The search fields are the list's columns and its extras; each is bound to a column, to `{ column, ability }`, or to `false` (not searched). A column that is encrypted, special, per-row or an internal column with erase `'clear'` is refused as a search field.
- `readList(event, source)` is for a route. `readListQuery(query, source)` is the same reader for a job, such as an export, that has a stored query and no request.
- `where()` and `orderBy()` take no table, because the source holds it; `orderBy()` returns an array to spread.
- The answer also has `ignoredWords`, `searchTooShort`, `matched(rows)`, which names the hidden field that matched for each row, and `answer(rows, total)`, which returns `{ rows, total, dropped, ignoredWords, searchTooShort }`, the one body a list route sends.
- The theatre's day is read only when a date filter is in use, so a list works before setup.

Two parts are not built, and each fails closed until it is. **Search through a child** (S6): a search extra that names a child is refused when the source is declared, with a message saying it is not yet available, so no list silently searches less than it says. **Auditing a search of a personal column** under an ability with `audit: 'read'`: until it is built, a search field bound with such an ability is refused when the source is declared. Both are a later slice of the kit, to be built before the first module list that needs them; the module build that needs one asks the kit build.

**Finding rows by the person's name or email (ruled 16 November 2026, raised by the box office desk).** A module's list does not search the accounts table, and child search is not the way to reach it: the name and email belong to identity. Identity offers one service for it, exported from core's services: `findAccounts(text)`. It answers an SQL subquery of account ids, never a list of ids, which the module passes to `inAccountScope` in its own list's condition, so the whole lookup is one statement and follows merges. It is identity's because the data, the ability that guards it and the audit of it are identity's; the kit only supplies the search index it runs on, which identity declares on its own table. It applies the list search rules (three letters, folding, no ranking), is called only under identity's people-lookup ability, which is `audit: 'read'`, and writes one audit entry per call that names the caller and the list but never the text typed, because that text is a person's name or address. A module that also keeps a contact name or email of its own (a guest order) searches that column in its own list in the ordinary way.

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
| Interface (6) | `core.navigation-group`, `core.home-card`, `core.record-tab`, `core.account-section`, `core.search-source`, `core.quick-action`, `core.help-page`, `core.on-shift-bar`, `core.tonight-tile` Added under R-35: `core.record-fact`, `core.record-check`, `core.list-column` | none | none |

**The access scheme (Identity, 16 November 2026).** A named part of the core, not a module; its names are indexed here and defined in the Identity Doc, parts 2, 3, 4 and 6. Tables `core_access_profiles` (`keyed by account, no id`) and `core_access_shares` (keyed by account and purpose, no id). The point `core.access-purpose` is a data point: a module declares a purpose with an id, a side, a label and explanation, an ability, the entries it uses and an optional record type. The vocabulary `core.access-need` is declared through `core.vocabulary`. The fact `core.access-scheme` is not a standing and has no `holders`, which the fact format allows; the value `core.access-scheme.companions` is offered through `core.requirement`. Abilities: `core.access-scheme.read`, `core.access-scheme.review`, `core.access-profile.read`, `core.emergency-contact.read`. Settings: the group `core.access-scheme.*` and `core.emergency-contacts.keep-after-standing`; these are separate from `core.access.fresh-within`, which is about permissions. The public page `/access` is a theatre content page holding Identity's component `CoreAccessApplication`, so it is deliberately not a reserved address prefix.

**Two interface points, as built (16 November 2026); the Interface Doc's part 4 defines them.** `core.search-source` takes `{ id, record, ability, route, shells }`: `route` is the module's own search route, which takes `?q=` and returns `{ ids }`, and the rows are resolved through the record type's `core.record-resolver`. `core.quick-action` takes `{ id, to, icon, ability, keywords? }`: `keywords` is a translation key, and there is no action field, because a quick action is always an address. The console group for the `spaces` module is labelled "Room bookings"; its id and `/console/spaces` are unchanged.

`core.production-section` was withdrawn on 16 November: `core.record-tab` is the one way to add to a record page. `core.account-section` is defined once, by the interface.

**Three more interface points (ruling R-35, 16 November 2026), which makes twelve; the Interface Doc's part 4 defines them.** `core.list-column` takes `{ id, list, ability, component, order, sort? }` and adds a column to another module's list. `core.record-fact` takes `{ id, record, ability, component, order }`. `core.record-check` takes `{ id, record, ability, order, check(recordId) }` and its check answers `{ done, sentence, link }`. Three rules from the formats apply to them. A contribution from a switched-off module is not shown, and one whose ability the viewer lacks is left out without a trace. A check runs on the server as the viewer, in one bounded statement, and its sentence is a label key with values, never prose built in code. A contributed column's `sort` is allowed only where it meets the same index rule as the list's own sorts (below), and `readList` joins it by subquery on the record id. Label keys for a list derive as `<module>.lists.<name>.<part>.<key>`.

Workstream 4 owns three modules, `box-office`, `payments` and `finance`, and declares its names under `box-office.*`, `payments.*` and `finance.*` in its own document; it needs no row here. The same is true of every second-round module, whose names are listed after the prefix table below.

## Index of id prefixes

Every id is `<prefix>_<26 characters>`. Prefixes are unique across the system, so foundations keeps the list. A table keyed by its own columns (a join table, or one keyed by a name) has no id and needs no prefix. Each prefix is followed by its table's name without the module's table prefix. Ids are time-sorted unless the Random column lists them.

| Owner, module and table prefix | Time-sorted | Random | Keyed by own columns |
| --- | --- | --- | --- |
| Foundations, `core_` | `evt` events, `job` jobs, `aud` audit, `ext` external\_calls, `sch` setting\_changes, `sgk` signing\_keys | none | modules, settings, migrations, task\_runs, credentials, idempotency\_keys, guard |
| Identity, `core_` | `acc` accounts, `aem` account\_emails, `pky` passkeys, `fid` federated\_identities, `rol` roles, `gra` grants (append-only; a grant is ended by a row in grant\_ends), `mrg` account\_merges, `mrgi` account\_merge\_items, `dreq` data\_requests, `emc` emergency\_contacts | `ses` sessions, `tok` account\_tokens, `pch` passkey\_challenges, `rcc` recovery\_codes | role\_abilities, fact\_abilities, access\_profiles, access\_shares, grant\_ends (append-only, keyed by grant), grant\_warnings (keyed by grant) |
| Core domain, `core_` | `sea` seasons, `prd` productions, `crd` production\_credits, `perf` performances, `ven` venues, `spc` spaces, `pla` place\_access, `clo` closures, `trm` terms, `ntf` notifications, `ndl` notification\_deliveries, `inb` inbox\_items, `ntd` notification\_template\_drafts, `ntt` notification\_templates, `psh` push\_subscriptions, `whk` webhooks, `whd` webhook\_deliveries | `fil` files | production\_slugs, production\_advisories, performance\_access, vocabularies, sender\_identities, notification\_routing, notification\_preferences, email\_suppressions, email\_events\_set\_aside (keyed by queue message) |
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

**Indexed as later, not in the first release (16 November 2026).** Content warnings, a later slice of the core domain that Matt accepted: the point `core.vocabulary` gains `grouped: true` (terms under headings), with table `core_term_groups` and column `core_terms.group_id`; tables `core_production_effects` and, later again, `core_performance_effect_exceptions`; a new vocabulary `core.staging-effect`. Their id prefixes are fixed when the slice is specified, and none of these names may be used for anything else meanwhile. Saved list views (id prefix svw, a view= value that is a saved view's id) are later too. Ruling R-35 is no longer later: Matt accepted the list and record page design on 16 November, and the three interface points beside `core.record-tab`, namely `core.record-fact`, `core.record-check` and `core.list-column`, declared by Interface in its part 4, and a kit server helper `readList` are indexed above and specified under "Lists" in this part.

Not available: every prefix above, and any prefix starting with `x`, which belongs to a theatre's own modules. Withdrawn and free again: `psl`, `adv`, `pfa`, `per`, fdr, fans, fopt, fpar (the four forms tables response\_drafts, answers, option\_counts and participation are keyed by their own columns).

**An id is never a secret.** Ids appear in logs, audit rows, event payloads and webhooks. Anything that grants access by being known (an invitation link, a resume link, a scan code, a sign-in link) is a separate random token on the row, stored hashed, and never the row's id. `random: true` only hides the moment of creation.

**Link tokens (ruled 16 November 2026, raised by the box office build).** A link that lets its holder see or do something is made in one of two ways, and no other.

- **T1. The ordinary way is a random token on the row.** The kit's `linkTokens.issue()` gives a token of 32 random bytes and its hash; the module stores the hash and an expiry on the row the link opens (the hash column is `col.internal` with erase `'clear'` where the row is a person's), and finds the row with `linkTokens.hash(presented)`. The address carries nothing but the token: no order, account, amount or email. Whatever the page shows or checks comes from the row. This is the way for anything that confirms, pays, changes or reveals: a booking confirmation, a resume link, an invitation, a pass. A token that must work once is cleared in the unit that uses it.
- **T2. A signed token, for an action that is harmless to repeat and needs no row,** such as leaving a mailing list from an email. It is made with `signing.sign` under a purpose the module declares, holds ids only (never a name, an address, an amount or anything of class personal or special) and an expiry inside it, and is treated as readable by anyone, because it is.
- **T3. No token is sealed.** `sealSpecial` and `CORE_ENCRYPTION_KEY` encrypt columns at rest and nothing else; a module never uses them to hide the contents of a token, a cookie or an address. A token whose contents would need hiding is a T1 token.
- **T4. Rules for the route that takes a token.** The token is a path parameter the route declares as `token` in its manifest entry, and the kit keeps a declared token out of the request log, error reports and audit detail. The landing page answers with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, loads nothing from another origin, and counts against the `presented-value` rate class. A wrong, used or expired token gets one answer, which does not say which it was.

**T5. How the raw token reaches the email (clarified with integration, 16 November 2026).** T3 means that a token is never an encrypted blob carrying data in an address, and that `sealSpecial` is not a way to make a token. It does not change how a raw random token travels from the unit that mints it to the message that carries it. `linkTokens.issue()` returns the raw token once; the module passes it straight to the notification as a variable of kind sealed (core domain, part 4: encrypted in `core_notifications.sealed_variables`, used in email only, cleared when delivery finishes), and that is the one way. The token's row keeps only the hash. A module never stores the raw token, never logs it, and never puts it in an event, a job payload or audit detail.

**The site's public address.** A module that writes a link into a message, a page or a file uses the kit's `siteUrl(path)`, which answers an absolute address on the site's one public origin. The origin is the setting `core.site.origin` (group site, declared with onChange confirm), set at first-run setup and changed only on the Theatre page of Admin (which took the place of `/admin/settings`), with a confirmation. It is never taken from a request's Host or Origin header, so a job, a queue consumer and a request all write the same address and a forged header cannot steer a link. Identity's passkey relying party is derived from the same setting; `relyingParty` is identity's own term and no other module imports it.

**One origin, enforced (ruled 16 November 2026 with the kit build).** First-run setup records `core.site.origin` from the address setup was run on; until setup has run, the request's own address stands in. After that the setting alone is the site's origin. The origin check on every change compares with it and nothing else, so a change sent to any other host that reaches the Worker (a workers.dev address, a preview address) is refused. A read on another host is redirected to the same path on the site's origin. To move a site to a new address, an administrator changes the setting from the old address, and the new one works from that moment. For the case where the old address is already gone, the optional Worker variable `CORE_SITE_ORIGIN`, set in the Cloudflare dashboard, prevails over the setting; the Health screen shows when it is in force and when it differs from the setting. `linkTokens` is built on identity's existing random-token and tagged-digest functions, which stay private to identity.

Three cases complete the rule (settled with integration, 16 November 2026).

- **A site set up before this was built has no origin recorded.** While `core.site.origin` is unset and no `CORE_SITE_ORIGIN` variable is given, the old behaviour holds: the origin check compares with the request's own address, nothing is redirected, and `siteUrl` answers from the request. Outside a request (a job, a queue consumer) `siteUrl` then fails with `core.site.origin-unset` and the job defers. The Health screen shows a warning, and an administrator records the origin there by an explicit confirmation that shows the address about to be recorded; it is never recorded silently from whichever host asks first.
- **Every other host is redirected, the workers.dev address and preview deployments included.** A preview deployment reads and writes the live database, so it is not a place to browse.
- **What is not checked by host.** A provider's webhook route is authenticated by its signature and is accepted on whatever host it arrives at; it is neither origin-checked nor redirected, and the address given to the provider is built with `siteUrl`. The queue, email, email-events and scheduled handlers have no host and are untouched. First-run setup and the platform's own health probe are served on any host.

**As built (kit pull request 107, 16 November 2026); this prevails where it differs from the paragraphs above.** `siteUrl` and `siteOrigin` come from `#kit`. `CORE_SITE_ORIGIN` prevails over `core.site.origin`; http is accepted only for localhost. Outside a request with nothing recorded, `siteUrl` refuses with `core.site.origin-unset` and the job is put back unrun, without spending an attempt. Once an origin is recorded, another host gets a 307 for a read and the refusal `core.access.wrong-origin` for a change; the health probe, a module's webhook routes (`/api/<module>/webhooks/*`) and setup are exempt. The health check `core.site-origin` has four states: unset (a warning that names the address the request came on), variable in force, variable differing from the setting (a warning), variable malformed (failing). One change to the rule above: an existing site's origin is not recorded from the Health screen. The setting has one home, the Theatre page; the health warning names the address and links there, and the setting's own confirmation shows the address before it is saved. There is no second route for it.

## Names declared by second-round modules

Each module's own document is the authority; these are listed so that nobody claims a name twice.

| Module | Requires and uses | Points | Facts | Record types |
| --- | --- | --- | --- | --- |
| `front-of-house` | as its document | `front-of-house.tonight-figure`, `front-of-house.report-section` | `front-of-house.on-shift` (on core.performance, standing), `front-of-house.leading-shift`, `front-of-house.rostered` (standing) | shift, assignment, incident, night-report, checklist-run |
| `spaces` | as its document | none | none | bookable (parent core.space, optional), booking, purpose |
| `bar` | requires payments, finance; uses front-of-house, membership, training | `bar.report` (later release) | `bar.tab-holder` | outlet, opening, sale, product, stock-item, stocktake, tab (parent bar.outlet, optional) |
| `training` | as its document | none | `training.competent`, `training.course-trainer` (both `pin: true`) | course and others as its document |
| `membership` | requires forms; uses communications | `membership.verifier`, `membership.charge` | `membership.holder` (standing), `membership.supporter`, `membership.scheme-holder`, `membership.voter` | scheme, membership, verification-list |
| `membership-fees` | requires membership, payments, finance | none | none | price, charge |
| `communications` | requires core; uses box-office, forms, membership, front-of-house | as its document, including `communications.audience-source`, to which the core never contributes | none | as its document |

**Reserved module ids (16 November 2026).** The kit's `RESERVED_MODULE_IDS` holds every module id settled in a specification, built or not, so that a manifest's `uses` and `requires` may name a module before its code exists: `core`, `box-office`, `payments`, `finance`, `forms`, `front-of-house`, `spaces`, `bar`, `training`, `membership`, `membership-fees`, `communications`. A `uses` that names a reserved id with no module present is satisfied as absent; a `requires` that does so fails the manifest check, as for any missing module. An id joins the list when its specification is accepted, through this index. A manifest may not name an id that is not reserved: inventory, which has no specification yet, is the first case, and Training leaves it out of its uses until it has one.

Requirement sources so far: `training`, `membership`, and `fact` (any declared fact). No module declares a point of its own for a per-person condition; `front-of-house.eligibility`, `box-office.eligibility`, `bar.price-eligibility` and `spaces.booking-rule` were withdrawn in favour of `core.requirement`. Membership's secret is `MEMBERSHIP_LIST_KEY`. Box office added the deliverable event `box-office.order.reserved`, the point `payments.desk-basket` and the code point `box-office.checkout-consent`. Practice mode (a live screen run on data that is not real) is a later story led by the interface.

Other platform names foundations added in the second round: the queue binding `EMAIL_EVENTS`, the rate-limit class `presented-value`, and the reserved address prefix`es /mailing and /forms. The one list of reserved prefixes is in the Module manifest tab`.

## Events foundations announces

| Event | When | Payload | Internal |
| --- | --- | --- | --- |
| `core.module.enabled`, `core.module.disabled` | A module is switched | module id | yes |
| `core.setting.changed` | A setting changes | key (never the value of a sensitive setting) | yes |
| `core.release.applied` | An update's migrations finish | release version | yes |
| `core.job.died` | A job uses up its attempts | job name and id | yes |

Core domain's vocabulary events, added from its build on 16 November 2026: `core.term.retired` (payload `termId`, `vocabulary`) and `core.term.merged` (payload `termId`, `vocabulary`, `intoId`). These two belong to core domain and are not internal, unlike foundations' four. `core.term.merged` is declared from the first release and first announced when merging terms ships (core domain's story C-22, later).

Added under integration ruling R-36 (managed is set per space, Matt, 16 November 2026): `core.space.managed-changed`, core domain's, payload `spaceId`, `venueId`, `managed`; no personal data; not internal, so it may leave in a webhook. The same change is offered to the existing point `core.change-impact` as the change `space.managed`.

All four of foundations' own events in the table above are internal: they are about the running of the site, so they are never sent to a theatre's webhooks. There is no event named `core.module.switched`.

## What foundations needs from the others

| From | Need |
| --- | --- |
| Identity (2) | The actor for a request (account, grants, standing), given to `can`; a strong session and a fresh sign-in where an ability needs them; the erasure flow that reads the data-class registry; the Owner and administrator preset roles that foundations' abilities suggest as holders; `holdersOf`, which the fact format now supports |
| Core domain (3) | The file store behind `files`; the notification service that the health screen uses to tell administrators about dead jobs and failed updates; branding and vocabulary for refusal pages; the task `core.email-events` behind the `EMAIL_EVENTS` queue |
| Interface (6) | The console shell that hosts foundations' screens; the standard refusal, empty and loading components; the group and address pattern for foundations' screens |

## Stability promise

The kit, the manifest format and the registries are versioned together as `manifest: 1`. Within a major version of Proscenium nothing in them is removed or changes meaning. A theatre's own module written against `manifest: 1` keeps working until the next major version, and the release notes of a major version list every change with what to do.
