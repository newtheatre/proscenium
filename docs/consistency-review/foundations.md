# Foundations consistency findings

Area: `docs/specs/foundations/` (all files, including the ruling log at the end of `02-formats.md` and the id-prefix index in `06-interface-to-other-modules.md`), checked against the other five specifications and the design paper (Part B, roadmap, backlog, status tab, catalogue).

Paths below are relative to `/home/user/proscenium/docs/`. `F:` = `specs/foundations/`. Line numbers come from `grep -n` on the files as they stand.

Two location notes. The id-prefix index is in `F:06-interface-to-other-modules.md` (tab 4), not in `04-data-model.md`; `04-data-model.md` only says which of foundations' own tables carry prefixes. The second-round specifications (front of house, spaces, bar, training, membership, communications) are not in this repository, so what foundations says about them (index entries, `uses` reservations) could be read only from foundations' side.

## Summary

41 findings: 9 HIGH, 20 MEDIUM, 12 LOW.

The three that matter most:

1. **The same setting or ability is declared under different names in different specifications** (findings 1 to 5): organisation and locale settings (foundations `core.locale.*` and `core.site.name`, core domain `core.organisation.*`, interface `core.language.*`), the members' area name and switch (identity vs interface), the fresh-sign-in window (foundations 15 minutes vs identity 10 minutes under another key), the audit-read ability (`core.audit.view` vs `core.audit.read`), and the module-switch event (`core.module.enabled`/`disabled` vs `core.module.switched`). Several of these would surface as a duplicated setting on the Settings screen or a listener on an undeclared event.
2. **Foundations' own settings and abilities tables do not follow foundations' own registry format** (findings 6 and 7): risk levels `low/medium/high`, audience `internal`, `owner: grants` on site-wide abilities and on record types that declare no owner column, a `data-protection lead` role that identity never defines, and screens at `/console/system/...` that the interface layer's own navigation rule (`to` under the module's id) would refuse.
3. **Backups have no owner** (finding 8): the paper, the identity specification and the roadmap all rely on a pre-migration backup, a nightly backup and a "retention of backups" setting that "is workstream 1's", and foundations specifies none of them.

Counts by severity: HIGH 1 to 9, MEDIUM 10 to 29, LOW 30 to 41.

---

## HIGH

### 1. HIGH. Organisation and locale settings exist three times
- **Side A** (`F:08-settings-and-abilities.md`): line 13 `core.site.name` "text, unset, 1 to 80 characters"; line 14 `core.locale.time-zone` "choice, `Europe/London`"; line 15 `core.locale.currency` "Cannot change once a ledger row exists"; line 16 `core.locale.language`; line 17 `core.locale.day-start` "time, 04:00, 00:00 to 08:00". Also `F:05-states-and-rules.md:107` (J6) "taken from `core.locale.time-zone`".
- **Side B** (`specs/core-domain-and-public-site/07-settings-and-abilities.md`): line 13 `core.organisation.name` "text, unset, 1 to 80 characters"; line 15 `core.organisation.time-zone` "choice, unset"; line 16 `core.organisation.locale`; line 17 `core.organisation.currency` "Refused once any money has been recorded"; line 18 `core.organisation.day-rollover` "time, 04:00, 00:00 to 08:00". Interface (`specs/interface-and-wireframes/06-settings-and-abilities.md:52-53`) adds `core.language.default` / `core.language.offered`, and line 56 says "Time zone, currency and the operating day's rollover hour are organisation settings owned by workstream 3".
- **Prevail:** core domain (3). It owns the organisation and the calendar helper (`operatingDayOf`, `dayBounds`), and the interface already defers to it. The time-zone default also differs (`Europe/London` vs unset); core's "unset until setup" matches the Setup screen, which asks for the zone.
- **Fix:** delete rows 13 to 17 from foundations 08; change J6 (`F:05:107`), the Setup step 4 wording, `F:07-screens.md` and any other `core.locale.*` mention to `core.organisation.time-zone`. Interface's `core.language.*` should be merged into `core.organisation.locale` (one language setting) or explicitly scoped as "languages offered to people" with core's key as the default. The currency rule should use one wording ("once any money has been recorded").
- **Owner:** foundations 08, 05 and 07; interface 06; core domain keeps its keys.

### 2. HIGH. Members' area name and switch declared twice
- **Side A** (`specs/identity/07-settings-and-abilities.md`): line 41 `core.members-area.enabled` "boolean, true, public"; line 42 `core.members-area.name` "text, Members' area, 40 characters, public, quotable".
- **Side B** (`specs/interface-and-wireframes/06-settings-and-abilities.md`): line 13 `core.shells.members-area` "On or off"; line 14 `core.shells.members-area-name` "Text, up to 30 characters ... Quoted publicly: Yes". Different limits (40 vs 30 characters) as well as different keys.
- **Prevail:** identity (2). It owns the members' area rule and the `core.member` fact, and its settings carry the preset defaults (`F:` presets in identity 07 lines ~83-88) that the interface text repeats ("off for a small venue").
- **Fix:** interface drops its two rows (and the "20 settings" count becomes 18), and refers to identity's keys.
- **Owner:** interface 06; identity unchanged.

### 3. HIGH. Fresh-sign-in window: two keys, two defaults
- **Side A** `F:08-settings-and-abilities.md:25`: "`core.security.fresh-sign-in` | duration | 15 minutes | 5 to 60 minutes ... How recent a sign-in must be for abilities marked fresh. Read by identity."
- **Side B** `specs/identity/07-settings-and-abilities.md:30`: "`core.sessions.reassert-window` | duration | 10m | 1m to 1h ... How long a fresh proof of identity covers further sensitive actions". Matt accepted identity's value on question I12 (`design-paper/11-design-stage-questions-and-status.md:66`: "fresh proof lasts 10 minutes").
- **Prevail:** identity (owner of assurance and fresh re-assertion, per `F:02-3-abilities-registry.md` "Who owns what" and the `fresh` ruling), and Matt's accepted I12.
- **Fix:** delete `core.security.fresh-sign-in`; let the registry's `fresh` default read `core.sessions.reassert-window`. Update `F:08` line 25 and the M7 / F-16 wording.
- **Owner:** foundations 08.

### 4. HIGH. Audit-read ability has two names; `core.setting.change` is declared by two owners
- **Side A** `F:08-settings-and-abilities.md:45`: "`core.audit.view` | site | medium | grants | Every search is audited"; line 37: "`core.setting.change` | `core.setting` | medium | grants | A setting may name a narrower ability of its own module in `change`...".
- **Side B** `specs/interface-and-wireframes/06-settings-and-abilities.md:65`: "`core.audit.read` | Open the Activity list and a record's full history | Site, module or record"; line 62: "`core.setting.change` | Change settings in a group; granted per settings group | Site or module | Site owner". Interface screen `05-screens.md:53`: "Activity | The audit trail as a filterable list | Per audit ability".
- Two names for one thing (`view` vs `read`), and one ability declared in two documents ("declared twice" fails the build per `F:02-formats.md:74`). Scope also differs: foundations puts it under a parent record `core.module`; interface says "per settings group".
- **Prevail:** foundations for `core.audit.view`/`core.setting.change` (it owns the Audit and Settings screens and the `core_audit` table); interface adopts them. Interface's "Activity" list is the same audit trail; the screen should be one screen.
- **Fix:** interface 06 removes both rows from its abilities table (it then registers 3, not 5, abilities) and cites foundations'; interface 05 "Activity" and foundations 07 "Audit" become one named screen. Settle one group concept: "per settings group" = per declaring module (`core.module` parent).
- **Owner:** interface 05, 06; foundations 07 (name the screen once).

### 5. HIGH. Interface listens for an event foundations does not announce
- **Side A** `specs/interface-and-wireframes/04-interface-to-other-modules.md:144`: "It reads `core.module.switched` (from workstream 1) only to refresh menus on open pages."
- **Side B** `F:06-interface-to-other-modules.md:104`: "`core.module.enabled`, `core.module.disabled` | A module is switched | module id". No `core.module.switched` anywhere in foundations.
- **Prevail:** foundations (declares the events). **Fix:** interface listens to `core.module.enabled` and `core.module.disabled`. Note also the ruling that these two are `internal: true` (`F:02-formats.md:156`) while the events table in foundations 06 does not say so; add an `internal` column there.
- **Owner:** interface 04; foundations 06 (add the column).

### 6. HIGH. Foundations' own ability table breaks the registry rules it states
- **Side A** `F:08-settings-and-abilities.md:34-47`: risk values "low", "medium", "high"; column "Owner role" with value "grants" on every row including site-wide ones (line 35 "`core.module.switch` | `core.module` | high | grants"); and the record-type table (line ~58) gives `core.module` "Owner: none". `F:05-states-and-rules.md:25` (M7): "risk high"; `F:10-test-plan.md:28`: "a high-risk ability lacks `fresh`".
- **Side B** `F:02-3-abilities-registry.md:51`: `risk` is `normal` or `privileged` (default `normal`); lines 52 and 121: `owner` is `grants`/`refuses`/`ignored`, and "An `owner` field on an ability whose record type declares no owner column fails the check". Identity and core domain use `normal`/`privileged` correctly.
- **Prevail:** the registry tab. **Fix:** rewrite the table with `risk: normal|privileged`, `owner` blank or `ignored` for all (none of these records has an owner), and say that `privileged` gives strong assurance and a fresh sign-in by default. Re-word M7 and the test-plan row ("a privileged ability lacks `fresh`" can never fail, since `fresh` defaults on; the check should instead be that none opts out).
- **Owner:** foundations 08, 05, 10.

### 7. HIGH. "Data-protection lead" is a role identity never defines; the System screens sit at addresses the interface rule refuses
- **(a)** `F:08-settings-and-abilities.md:48`: "`core.audit.view` is also offered to the data-protection lead role that identity defines"; `F:07-screens.md:15` "Owner; data-protection lead"; `F:09-stories.md:65` F-33 "As a data-protection lead". Identity's preset roles (`specs/identity/07-settings-and-abilities.md:~134-170`) are 15 keys: owner, administrator, committee-member, box-office-manager, box-office-staff, front-of-house-manager, bar-manager, technical-manager, finance-officer, membership-officer, communications-officer, production-lead, visiting-company, volunteer, welfare-lead. There is no data-protection lead (grep for "data-protection" finds it only in foundations). Matt's "preset roles stay at fifteen" (`design-paper/12-build-backlog-and-glossary.md:146`) closes the list.
  - **Fix:** name an existing role (administrator or committee-member) as the suggested holder, or ask identity for a sixteenth role (needs Matt). Foundations should not claim a role identity does not have.
- **(b)** `F:07-screens.md:5,10-14`: screens "under a group called System" at `/console/system/modules`, `/settings`, `/jobs`, `/credentials`, `/health`, `/audit`. Interface `04-interface-to-other-modules.md:49`: `to` "Must sit under the shell's prefix and the module's id"; `05-1-shells-and-navigation.md:99` "Within a shell the next segment is the module"; the fixed group order (line 111) is "... Reports, Site settings" with no System group, and line 46 says "Site settings is the last group: organisation, branding, modules, roles, people, updates and health".
  - `system` is not a module id and `core` is. Either the address is `/console/core/...` or the interface rule must allow the core's areas. The group is "Site settings" in one document and "System" in the other.
  - **Prevail:** interface (owner of the shell and navigation checks). **Fix:** one group name and one address pattern for foundations' screens; adjust foundations 07 and the contributions it makes to `core.navigation`.
- **Owner:** foundations 07, 08, 09; interface 04/05 to confirm the pattern; identity if a role is added.

### 8. HIGH. Backups are relied on everywhere and specified nowhere
- **Side A (relies):** `design-paper/05-1-data-settings-and-permissions.md:11` "A backup to R2 is taken before migrations run. A failed migration leaves the previous version serving."; `design-paper/06-setup-branding-and-public-site.md:39` "Backups run nightly to the theatre's own file store and can be downloaded."; `design-paper/05-part-b-conventions.md:14` "Cron triggers | Sweeps, reminders, digests, nightly backup"; `specs/identity/04-states-and-rules.md:270` "The retention of backups is workstream 1's setting, and the privacy page quotes it."
- **Side B:** `grep -ri backup specs/foundations` returns nothing. Foundations' migration rule G3 (`F:05:~37`) is one batch per migration, with no backup step; there is no backup task, no retention setting, no restore story, no health check for it.
- **Prevail:** the paper and identity (both treat it as foundations' job). **Fix:** foundations adds a task `core.backup`, a retention setting (e.g. `core.backups.retention`), a pre-migration backup step in G1, a health check, and a story; or the paper drops the claim (needs Matt: it is a recorded convention). Note D1 time travel is an alternative to evaluate, and that the erasure rule (identity) depends on the retention number.
- **Owner:** foundations (states, settings, stories); paper Part B if the decision is to drop it.

### 9. HIGH. Interface layer's three tables have no prefix, no heading line and are not in the index or the backlog count
- **Side A** `specs/interface-and-wireframes/02-data-model.md:3`: "The interface layer owns three small tables in the database" (`core_preferences`, `core_saved_views` with `id` "Primary key, opaque", `core_navigation_overrides`); line 5: "The column layout will follow workstream 1's data-class registry once that sub-tab is written".
- **Side B** `F:06-interface-to-other-modules.md:60-64` (index of id prefixes) has rows for foundations, identity, core domain, box office, forms and later modules, none for interface; line 52 gives interface no record types. `design-paper/12-build-backlog-and-glossary.md:107-116` "The data model in numbers" totals 109 tables with no interface row.
- `F:02-formats.md:159` requires "a prefix to every table in its data model"; `core_saved_views` has an id and therefore needs one. The registry sub-tab it waits for has existed since draft 1, and the heading line (realm, subject, retention) and `col.account` roles are missing from all three.
- **Prevail:** foundations' format. **Fix:** interface rewrites part 2 in the layout, picks a prefix for `core_saved_views` (e.g. `svw`), and foundations adds an Interface row to the prefix index and the backlog count becomes 112. `core_preferences` keyed by (`account_id`, `key`) needs `col.account` with `role: subject` and `onMerge` (it says "Row deleted" on erasure but declares no merge behaviour).
- **Owner:** interface 02; foundations 06 index; backlog 12.

---

## MEDIUM

### 10. MEDIUM. Points index is incomplete
- **Side A** `F:06-interface-to-other-modules.md:52` Interface (6): "`core.navigation-group`, `core.home-card`, `core.record-tab`, `core.account-section`, `core.search-source`, `core.quick-action`". The document's own claim (`F:01-overview.md:228`, "index of every `core.*` and `forms.*` name").
- **Side B** `specs/interface-and-wireframes/04-interface-to-other-modules.md:21,23`: also `core.help-page`, `core.on-shift-bar`, `core.tonight-tile` (and `core.public-component`, which is indexed under core domain). `core.requirement` appears only in the later "Added in the second round" paragraph, not the table.
- **Fix:** add the three points to foundations' index. Nine extension points (line 3 of interface 04) now means nine plus two.
- **Owner:** foundations 06.

### 11. MEDIUM. Core domain declares a second module, `public-site`, that foundations does not know
- **Side A** `specs/core-domain-and-public-site/05-interface-to-other-modules.md:8`: "Public site | `public-site` | `core` | Yes (can be switched off) | The public pages, feeds and content components"; settings and abilities `public-site.*` (`07-settings-and-abilities.md:~73-80`, `public-site.site.configure`).
- **Side B** `F:02-formats.md:107`: "There is one always-on module, `core`. Identity, the core domain and the interface are areas inside it". `F:03-scope.md:300` and `F:12-1:26` also describe the core domain as inside `core`. Reserved-id list (`F:02-formats.md:165`) names front-of-house, spaces, bar, training, membership, communications only. Neither `public-site` nor `membership-fees` (a second module of the membership spec per `F:06:~90`) is in it.
- **Prevail:** unclear, needs a decision by the integrating thread (the catalogue `design-paper/04-2-module-catalogue.md:20` lists Public site as a switchable module needing Core, which supports core domain). **Fix:** foundations states that the core domain area holds two modules (`core`, `public-site`), adds `public-site` (and `membership-fees`, and the later catalogue modules) to the reserved list, and says what `/whats-on` and `/shows` (core-owned prefixes) do when `public-site` is off.
- **Owner:** foundations 02-formats ruling log; core domain 05.

### 12. MEDIUM. A public route is declared three ways
- **Side A** `F:02-3-abilities-registry.md:112`: "must say `ability: 'public'` or `ability: 'signed-in'`".
- **Side B** `F:05-states-and-rules.md:129` (R1) "must say `public: true`"; `F:09-stories.md:14` (F-04) "neither `ability` nor `public: true`"; `F:10-test-plan.md:27`; `F:06:16` lists `public` as a `defineRoute` option. Identity (`07-settings-and-abilities.md:~128`) says "The route declarations `public` and `signed-in`".
- **Prevail:** the registry tab and identity (two values, `public` and `signed-in`). **Fix:** one form in R1, F-04, the kit row and the test plan; add `signed-in`.
- **Owner:** foundations 05, 06, 09, 10.

### 13. MEDIUM. Function and token names disagree with the "As built" list
- `F:02-formats.md:196-197` (prevails): "The content token is `:setting{name="..."}`. `key` cannot be used because Vue reserves it." and "A point is read with `usePoint(name)`; `point()` is the manifest helper".
- Still `:setting{key=...}`: `F:02-2-settings-registry.md:92`, `F:02-5-worked-example.md:94`, `F:05-states-and-rules.md:132` (R4), `F:09-stories.md:42` (F-22), and, outside foundations, `specs/core-domain-and-public-site/05-interface-to-other-modules.md:246` and `08-stories.md:83` (C-41). The core text says "the form the foundations draft fixes", which is no longer true.
- Still `point(name)` "Reads the contributions to a point": `F:06:19` (kit table). Settings are `await useSetting(...)` in `F:02-2:90` but `setting(key)` in `F:06:17`, `F:05` R3, F-09. As built does not name the setting reader, so pick one.
- **Fix:** replace the token in all places; use `usePoint`; decide `setting` vs `useSetting` once (the as-built guide `docs/kit/README.md` decides).
- **Owner:** foundations tabs 02-2, 02-5, 05, 06, 09; core domain 05 and 08.

### 14. MEDIUM. Settings audience value `internal` does not exist
- `F:08-settings-and-abilities.md:14,17,23-28`: Audience "internal" (and "public, quotable" as one cell at line 13). `F:02-2-settings-registry.md:62`: "`public`, `signed-in` or `staff`", default `staff`. Every other spec uses these three values.
- **Fix:** replace `internal` with `staff` and split the Quotable column as the "How to list settings" layout requires (`F:02-2:114` onwards: Key, Kind, Default, Limits, Changed by, Audience, Quotable, Purpose). Foundations 08 also omits the required `change` ability per setting.
- **Owner:** foundations 08.

### 15. MEDIUM. Rate-limit setting keys
- `F:08-settings-and-abilities.md:79`: "the numbers are settings under `core.limits.*`". `F:02-formats.md:202` (as built, prevails): "`core.rate-limits.<class>`". Also the 08 table gives allowances as words ("generous", "strict") instead of the numbers the as-built list says are settings.
- **Fix:** `core.rate-limits.<class>` with numbers.
- **Owner:** foundations 08.

### 16. MEDIUM. A switched-off module's queued jobs: still run, or wait?
- `F:02-1-module-manifest.md:251`: "Jobs already queued | Still run, so an email for a booking already made is still sent".
- `F:05-states-and-rules.md:22` (M4): "its jobs stop being claimed (queued ones wait)"; `F:04-data-model.md:59` ("So a module's jobs stop being run when it is switched off"); `F:02-formats.md:200` "The older line that they still run is withdrawn"; story F-32 "a job of a switched-off module cannot run and says why".
- **Prevail:** M4 and the as-built list. **Fix:** change the table row in the manifest tab. The booking-email example is exactly why the owning modules (box office, forms) should check whether they are happy with it; box office's `payments.settlement` and ticket emails depend on `communications`/`core` being on, not on box office, so low risk.
- **Owner:** foundations 02-1.

### 17. MEDIUM. Status statements in the overview, formats tab and proofs are stale or disagree
- `F:01-overview.md:37`: "Waiting on Matt | Six of the seven questions in tab 9 (question 4 is decided)." vs `F:11-questions-for-matt.md:7`: "All seven are now decided".
- `F:01-overview.md:35`: "Proof 2 ... Passed locally. A real deploy on an account is question 5." vs `F:13-proofs.md:10`: "Passes on a real account" (and the real run described there).
- `F:01-overview.md:20` and `F:09-stories.md:5`: "Thirty-four stories", vs the F-35 note in the same tab and `F:02-formats.md:202` (F-36, "Story F-36, first release") and `design-paper/12-build-backlog-and-glossary.md:9,154` ("F-01 to F-35 ... 35", then "Foundations is now 36 stories"). F-36 has no row in tab 7.
- `F:02-formats.md:5` "**Status: draft 1**", title "Formats: draft for alignment", and the "Still open" list (lines 95-99: per-venue settings, the shell list, preset role names) all of which are now decided (question 1, interface's shells, identity's fifteen presets).
- **Fix:** update the status table; add F-36 to tab 7 and the count; retitle and clear "Still open".
- **Owner:** foundations 01, 02-formats, 09, 13.

### 18. MEDIUM. Code samples in the format tabs still use superseded forms
Where the as-built list (`F:02-formats.md:193-205`) says it prevails "including code samples":
- `defineTable(name, columns, options)`: `F:02-4-data-class-registry.md:12` and `F:02-5-worked-example.md:122` pass options second and columns third.
- `col.id()` "an opaque identifier the kit generates (a ULID)" (`F:02-4:80`) predates the scoped-id ruling (`F:02-formats.md:159`: `defineTable(..., { id: 'ord' })`); neither sample declares a prefix.
- "A subject is an account or an email, never both" survives at `F:02-4:141` and `F:02-formats.md:139`, after `F:02-formats.md:209` withdrew it (and `specs/form-builder/03-data-model.md:153` still builds its own "never both" constraint, which is acceptable for forms but should not cite the rule).
- `col.account(...)` example at `F:02-4:93` is described as "should read" rather than corrected in the sample; `col.email` is used in rulings but has no row in the helper table.
- **Fix:** update samples; add a prefix to each example table; give `col.email` a row.
- **Owner:** foundations 02-4, 02-5.

### 19. MEDIUM. The worked example breaks the rule it teaches
- `F:02-5-worked-example.md:144` "**`lost_property_items`**: realm operational; subject none through an account" with `claimant_name`, `claimant_phone` (personal) and `claim_note` (free text). `F:02-4-data-class-registry.md:72`: "A table with `subject: 'none'` may not hold personal, free-text or special columns." and `F:02-formats.md:207`: the schema check "refuses a subject-none table that has a personal column". The closing note at line ~165 says the check refuses personal columns "with neither a subject nor a retention", a third wording.
- **Fix:** give the example a legitimate form: `subject: { email: 'claimant_email' }` or `unlinked: 'staff'` (the incident case), keeping `retention`. "subject none through an account" is not a valid declaration.
- **Owner:** foundations 02-5.

### 20. MEDIUM. Encryption keys and core secrets
- `F:08-settings-and-abilities.md:65`: `CORE_ENCRYPTION_KEY` "Encrypts stored credentials and columns of class special"; `F:02-4:44`: special columns are encrypted "with a key held as a Worker secret". Identity (`specs/identity/05-interface-to-other-modules.md:213`) declares `CORE_PROFILE_KEY` "Encrypting access profiles; versioned so it can be rotated", and identity's data model (`03-data-model.md:334`) stores the answers "encrypted in the application ... Special category".
- Identity also declares `CORE_SESSION_KEY`, `CORE_GOOGLE_CLIENT_SECRET`, `CORE_OWNER_RECOVERY` (lines 212, 214, 215), which foundations' secrets table (three entries) does not list. Foundations 08 line 3 says other areas "add their own `core.*` entries in their documents" but its health screen and setup check ("encryption key present") read only its own.
- **Prevail:** unclear: either `col.special()` always uses `CORE_ENCRYPTION_KEY` (then `CORE_PROFILE_KEY` goes), or foundations lets a module bring its own versioned key. Needs a ruling. **Fix:** one sentence in the data-class tab; foundations 08 says the secrets table is complete only per area.
- **Owner:** foundations 02-4, 08; identity 05.

### 21. MEDIUM. First-run setup is described three ways
- `F:07-screens.md:21-26`: six steps: check, prepare database, create Owner ("Name, email, sign-in method (from identity)"), the theatre (name, time zone, currency, language), starting point, checklist.
- `specs/identity/06-screens.md:112`: "Create the first Owner ... Name, address, passkey, recovery codes typed back; writes the setup grant"; `08-stories.md:253-255` (ID-37) requires a passkey and saved recovery codes.
- `specs/interface-and-wireframes/05-3-key-journeys.md:149-150`: "apply the database, create the owner with a passkey" then "Five steps: theatre name and type, time zone and currency, brand colour and logo ..., modules to switch on, sample data or a clean start". `05-screens.md:67` lists "First-run setup" as an interface screen of type Steps; `design-paper/06-setup-branding-and-public-site.md:9` adds "season pattern".
- Differences: "sign-in method" (foundations) vs mandatory passkey and recovery codes (identity); brand and logo and sample data have no place in foundations' six steps; step order differs.
- **Prevail:** identity for the Owner step (security rule); foundations owns the sequence and the setup code. **Fix:** foundations 07 lists the full sequence once, naming the step each other workstream contributes (identity's Owner step, core's brand step through `core.setup-step`, interface's frame), and drops "sign-in method".
- **Owner:** foundations 07; interface 05-3.

### 22. MEDIUM. Reserved address prefixes are listed four different ways
- Full ruling set (`F:02-formats.md:116,135,157,165`): `/account /members /console /live /book /sign-in /setup /api`, underscore, `/files`, `/whats-on`, `/shows` (replacing `/archive`), `/mailing`.
- `F:02-1-module-manifest.md:188` lists only the first eight plus underscore. `F:12-1-repository-and-owned-paths.md:74` adds `/files` only. `specs/interface-and-wireframes/05-1-shells-and-navigation.md:88-97` (Addresses table) shows neither `/files`, `/mailing`, `/whats-on` nor `/shows`, and uses `/whats-on` as an example of a theatre's own content page ("`/about`, `/whats-on`, `/whats-on/hamlet`"), although the ruling makes it a core-owned prefix. The check that "refuses a page in `site/` under a reserved prefix" is therefore described differently in each place.
- **Prevail:** the ruling log. **Fix:** one canonical list in the manifest tab; the others link to it; interface drops `/whats-on` from "anything not reserved".
- **Owner:** foundations 02-1, 12-1; interface 05-1.

### 23. MEDIUM. Interface says three shells; foundations says four "shells"
- `F:02-formats.md:116`: "Shells for a navigation entry are `account`, `members`, `console` and `live`." Interface (`05-1-shells-and-navigation.md:3`): "three shells ... plus a chrome-free live mode"; `04-interface-to-other-modules.md:~48` says `account` "is My account in the public shell"; U1 (`design-paper/11-design-stage-questions-and-status.md:115`, closed as recommended): "Three shells plus a live mode with no navigation" over "Four shells". The paper's Part B (`05-2-security-privacy-and-interface.md:40`) says "Three shells: public, member and console".
- This is a naming clash, not a design clash, but `shell:` in the manifest then holds a value (`account`) that the owner says is not a shell, and a reader of foundations will count four shells, the option Matt declined.
- **Prevail:** interface (owner; Matt's U1). **Fix:** foundations calls the manifest field values "menus" (or "destinations") and says there are three shells plus live mode; or rename the field. Foundations 07 "the console shell" stays.
- **Owner:** foundations 02-formats, 02-1; interface 04.

### 24. MEDIUM. Foundations' stale references to "one queue" and to the bindings
- `F:12-design.md:16`: bindings `DB`, `FILES`, `CACHE`, `JOBS_PROMPT`, `JOBS_BULK`, `LIVE`, a rate-limit binding; no `EMAIL_EVENTS`. `F:02-formats.md:211` (a later ruling) adds `EMAIL_EVENTS`, "a second queue" (a third in total), consumed by the same Worker; the same ruling says "One queue" in older wording "now means one queue for the platform's own jobs". `F:01-overview.md:273` ("two queues") and `F:02-1-module-manifest.md:122` ("two queues, one per lane") do not mention it.
- Outside: `specs/box-office-payments-ledger/05-interface-to-other-modules.md:196` "one queue and one cron | Matches draft 1"; `design-paper/05-part-b-conventions.md:87` "One cron trigger and one queue for the whole Worker".
- **Fix:** list `EMAIL_EVENTS` in the bindings and the overview diagram; box office and Part B say "one queue per lane for the platform's jobs".
- **Owner:** foundations 12-design, 01, 02-1; box office 05; paper Part B.

### 25. MEDIUM. Part B (paper) contradicts the foundations rulings it says win
`design-paper/05-part-b-conventions.md`:
- line 40: "`site/` | Theatre | A Nuxt layer with the highest priority" and line 47 "Layers give override-by-filename"; vs line 100 in the same file ("`site/` must be the Nuxt project itself ... not an extended layer") and `F:13-proofs.md:34` (Finding 1). Also `design-paper/10-next-stage-detailed-design.md:43` "override pages from a `site/` layer".
- lines 41 and 46: "`site.config.ts` | Deploy configuration: Worker name, domain, resource names" and "Deploy identifiers live in `site.config.ts`"; vs `F:12-1-repository-and-owned-paths.md:34-37,45` (`wrangler.jsonc` holds the Worker name and domain "Nothing else"; `site.config.ts` holds release channel and build-time choices) and `F:12-design.md:16` ("no identifiers or fixed resource names"). Line 112 "Set deploy configuration: domain, resource names, secrets" has the same problem (secrets are Worker secrets set in the dashboard, `F:02-1:~172`).
- lines 101-103: "Windows and macOS still need a CI matrix", "Last seat ... Still to run against a deployed database", "One-step deploy | In progress | None yet"; vs `F:13-proofs.md:10-12` (Linux only, decided), `design-paper/11-design-stage-questions-and-status.md:20` (11 of 11 on a deployed D1 over 20 rounds) and `12-build-backlog-and-glossary.md:74` (real deploy done).
- line 83: "(draft 1, 16 November 2026)".
- **Prevail:** foundations (the paper states "where the two differ it wins"). **Fix:** update the repository table, the proofs table and the draft reference.
- **Owner:** design paper Part B.

### 26. MEDIUM. Pull-request previews: on or off
- `design-paper/05-3-engineering-releases-and-docs.md:24`: "Preview: every branch deploys to a preview bound to preview-only resources, so a branch never touches production data, as Mailflare does."
- `F:12-3-ci-and-test-harness.md:60`: "Preview deployments for pull requests are off by default, because a preview shares the production database; a theatre that wants them connects a second Worker with its own resources."
- **Prevail:** foundations (it names the reason and the engineering tab is the older text). **Fix:** paper changes to "off by default".
- **Owner:** paper 05-3.

### 27. MEDIUM. "Any platform" tests in the paper
- `design-paper/05-3-engineering-releases-and-docs.md:14`: "Tests run locally on any platform". `F:12-3:6` and `F:13-proofs.md:86`: Matt decided Linux is the only supported system; `design-paper/10-next-stage-detailed-design.md:45` still describes the proof as "Windows, macOS and Linux".
- **Fix:** "on Linux, the supported system" in both. Also the commands line (`05-3:7` "`dev`, `preview`, `build`, `typecheck`, `lint`, `test`, `check`") does not match foundations' list (`F:12-3:30-38`: `dev`, `check`, `test`, `test:browser`, `db:generate`, `verify`); `preview` and `typecheck` are absent from foundations although the Mailflare rule it quotes ("a preview command is part of the standard workflow", Part B line 26) depends on `preview`.
- **Owner:** paper 05-3, 10; foundations 12-3 (add `preview`, `typecheck` or say `check` includes types).

### 28. MEDIUM. Interface write queue outlives the idempotency window
- `specs/interface-and-wireframes/02-data-model.md:63`: write queue entries are kept "Until confirmed or dismissed"; the entry's `id` is the idempotency key. `F:05-states-and-rules.md:134` (R6): the stored response is replayed "for a repeat within 48 hours"; `F:04-data-model.md:18` `core_idempotency_keys` retention "48 hours".
- A queued write retried after 48 hours, whose first attempt did commit but whose acknowledgement was lost, would run twice. Rare, but it is exactly the case the key exists for (door admissions, till sales).
- **Fix:** either the interface queue expires entries at or before 48 hours (marks them stuck and asks the person), or foundations makes the window a setting at least as long as `core.live.stuck-after` plus the queue's life. Needs both owners.
- **Owner:** interface 02/03; foundations 05 R6.

### 29. MEDIUM. Foundations 02-1: a theatre module path and a few late fields
- `F:02-1-module-manifest.md:238`: "A theatre's own module has the same shape under `site/modules/x-<name>/`". Every other statement (`F:02-formats.md:145`, `12-1:43,65,78`, `09-stories.md:54` F-29, `12-design.md:17`, `01-overview.md:54`) says `site/layers/x-*/`.
- The manifest tab's field table also lacks `credentials`, `calls`, `settingRules`, `switchOff` and `lane`/`weeklyOn` in its tables; only a closing note names three of them (line 259). A reader following the tab alone writes a manifest the check rejects or omits `calls`, which the external-call lint (X3 in `F:05`) requires.
- **Fix:** correct the path; fold the late fields into the field table.
- **Owner:** foundations 02-1.

---

## LOW

### 30. LOW. Setup presets named differently
`F:07-screens.md:25`: "A preset (for example a student theatre, a receiving house, a society with no building)". `F:02-1-module-manifest.md:220`, identity 07 and the paper: the three presets are `student-society`, `amateur-company` and `small-venue`. Fix the examples.

### 31. LOW. Realm values
`F:02-4-data-class-registry.md:66`: realm is `audience`, `member` or `operational`. `F:04-data-model.md:9-20` gives every foundations table realm `system` (not in the list). `specs/core-domain-and-public-site/03-data-model.md:77`: "realm members" (plural). Add `system` to the list or use `operational`; use `member`.

### 32. LOW. `core_jobs` states and `core_task_runs` columns
`F:04-data-model.md:63` lists job states `queued, running, done, failed, dead, cancelled`; the diagram in `F:05` (J) has no `Failed` state (failed with attempts left returns to Queued). `F:02-formats.md:201` says `core_task_runs` has a `job_id` column; `F:04-data-model.md:~66` does not list it, nor does the ER diagram show the link as a column. Add the column; drop or define `failed`. Also the daily `core.prune-history` task has no row in tab 3 or the retention column.

### 33. LOW. Table naming rule vs foundations' own tables
`F:02-formats.md:39`: "module id in snake_case, then a plural noun". `core_audit` and `core_guard` (`F:04-data-model.md:17,20`) are singular (as-built item 11 fixes `core_guard`). State the exception or rename `core_audit` to `core_audit_entries`; keep `core_guard`.

### 34. LOW. Lanes not declared on export jobs
`F:02-1-module-manifest.md:~130`: "`lane: 'bulk'` is for imports, exports, report builds and mailings". `specs/identity/05-interface-to-other-modules.md:201` `core.build-export` and `specs/form-builder/05-interface-to-other-modules.md:144` `forms.build-export` declare no lane, so both default to `prompt` and can sit ahead of a ticket email. Add `lane: 'bulk'` in both.

### 35. LOW. Settings screen wording uses `change:` for something else
`F:07-screens.md:46`: "Settings marked `change: 'reason'` ... `change: 'confirm'`". `F:02-2-settings-registry.md:61`: `change` is "The ability needed to change it". The registry has no field for requiring a reason or confirmation; `F:08` uses prose ("Change needs a reason", "Change needs confirm"). Add a field (`on-change: 'reason' | 'confirm'`) or reword.

### 36. LOW. Foundations' count of screens and "Owner" role wording
`F:07-screens.md:3` says "Seven screens, all in the console" while the same paragraph says "All but Setup live in the console shell"; Setup is at `/setup` (a centred layout per `specs/interface-and-wireframes/05-screens.md:66-67`). Say "six console screens and Setup". Also "Owner role" as a column heading in `F:08` (line 33) clashes with the registry's `owner` (record owner) and with identity's "Owner" role; rename the column "Held by default".

### 37. LOW. Interface's settings and abilities tables are not in the registry layout
`specs/interface-and-wireframes/06-settings-and-abilities.md:11-56` uses "Type / Who changes it / Quoted publicly" with a role name ("Site owner") rather than the `change` ability, no Limits or Audience column, and plain-word kinds ("On or off", "Whole number"). `F:02-2-settings-registry.md:114-128` requires Key, Kind, Default, Limits, Changed by, Audience, Quotable, Purpose. The abilities table (line 59) has no Risk or Owner columns. Re-cut in the format.

### 38. LOW. Stale "draft 1" and "sub-tab empty" status in other specs
- `specs/box-office-payments-ledger/05-interface-to-other-modules.md:197`: "The data-class column layout | Sub-tab still empty; part 2 uses its own layout until then"; line 196 "Matches draft 1"; line 198 identity "Assumed" although identity has confirmed `findOrCreateAccount`.
- `specs/interface-and-wireframes/04-interface-to-other-modules.md:5,10-20`: "draft 1 of workstream 1's formats ... In draft 1 / **New**"; core domain 05:10 "the foundations draft's four mechanisms"; identity 07:3 "foundations draft"; 30 hits of "foundations draft" or "draft 1" across non-foundations files.
- Update the status columns so a builder does not think a format is unsettled.

### 39. LOW. Examples that differ from the owning specification
- `specs/interface-and-wireframes/04-interface-to-other-modules.md:38`: example navigation entry `ability: 'box-office.order.read'` and a count `box-office.refunds-awaiting`; box office's ability is `box-office.order.view` (`specs/box-office-payments-ledger/07-settings-and-abilities.md:93`).
- `F:02-formats.md:47-48`, `F:02-1-module-manifest.md` and the manifest example use `box-office.order.paid`; box office decided "The event name is `box-office.order.confirmed`, not `order.paid`" (`05-interface-to-other-modules.md:229`). Examples are labelled examples, but they are the first things copied; align them.

### 40. LOW. Identity intro counts
`specs/identity/07-settings-and-abilities.md:3` "29 settings and 16 abilities" vs line 122 "That makes 17 rows" (the table has 17 abilities; settings count 29 is right). Outside foundations' area but it feeds `F:` index counts; fix "16" to "17".

### 41. LOW. Paper wording that predates foundations
- `design-paper/04-2-module-catalogue.md:24`: "Payments | ... | Needs: Box office or Bar" vs the ruling (`F:02-formats.md:89`) "Box office and Bar each require Payments; no either-or" (and Bar also requires Finance). The catalogue's "Sixteen modules ... Each can be switched off" (line 3) and the Forms builder "part of the core" (`design-paper/04-3-form-builder.md:3`) predate `switchable: false` and the `public-site`/`membership-fees` split.
- `design-paper/10-next-stage-detailed-design.md:3`: "Nothing here has started; it waits for Matt's go-ahead."
- `F:06-interface-to-other-modules.md:54`: "Box office (4) declares its names under `box-office.*`" omits that workstream 4 also owns the modules `payments` and `finance` (tables `payments_`, `finance_`, points `payments.*`, `finance.*`).

---

## Checked and consistent

- **Identity table prefixes and count.** The 17 identity tables and their 15 prefixes in `F:06` match `specs/identity/03-data-model.md:18-34` exactly (acc, aem, pky, fid, rcc, tok, pch, ses, rol, gra, mrg, mrgi, dreq, emc, apr); two keyed tables.
- **Core domain prefixes and count.** 26 tables, 17 time-sorted prefixes plus `fil` random and 8 keyed tables in `F:06` match core domain `03-data-model.md:568-596`; the withdrawn `psl`, `adv`, `pfa` are not used.
- **Box office, payments, finance prefixes.** 22 + 9 (with `pip`) + 7 = 38 tables, backlog totals (109 = 12 + 17 + 26 + 22 + 9 + 7 + 16) match; no prefix appears twice in the foundations index (checked mechanically). Forms has 17 tables once `fcoa` is counted (backlog says 16, written before `fcoa`).
- **Second-round table counts in the backlog** (FH 17, Spaces 7, Bar 20 before `btab`/`brrv`, Training 12, Communications 9) agree with the index lines.
- **Module dependencies.** Box office requires payments and finance; payments requires finance; box office `uses` membership, front-of-house, communications (all in the reserved list). No either-or dependency; matches `F:02-formats.md:89`.
- **Points.** Identity's four points, core domain's ten declared plus four manifest-declared (`core.vocabulary`, `core.file-slot`, `core.notification-type`, `core.notification-topic`) and forms' five (`forms.slot`, `.field-type`, `.bindable`, `.outcome-action`, `.template`) agree with the foundations index. Facts `core.member`, `core.production-team`, `training.*`, `membership.*` as indexed.
- **Record types.** Identity's four, core domain's eight, and foundations' four match the index and `F:08`.
- **Preset ids and roles.** `student-society`, `amateur-company`, `small-venue` agree between the manifest tab, identity and the paper; the 15 role keys are the ones the other specs and the backlog use.
- **Idempotency and refusal body.** `Idempotency-Key` header and `{ code, reason, remedy?, fields? }` agree between foundations (R2, R6) and interface 04 (items 4 and 5).
- **Webhook and internal-event rulings** are applied consistently by identity (`internal: true` on every identity event, `05:121`), box office (`internal` column, `05:134-136`), core domain (`03-data-model.md:526`) and forms (`05:75`).
- **`requirements` ruling and `whenUnavailable`.** Box office (`05:254-256`) records the withdrawal of "never enforced" and follows the host-chooses rule.
- **Decisions recorded as Matt's.** Q1 to Q7 outcomes in `F:11` agree with `design-paper/11-design-stage-questions-and-status.md:46-52` (D1 to D7), including Linux-only tests, scoped ids and "no promise before 1.0"; `/whats-on/<slug>` then `/shows/<slug>` agrees across ruling log, core domain and C7.
- **`forms` always on (`switchable: false`)**, `col.perRow`, `core.privacy-record` and erasure in append-only tables agree between foundations and the form builder.
- **Account columns.** Box office and forms use `col.account` roles and `alias` on append-only tables as foundations requires (`form-builder/03-data-model.md:27`).
- **Rate-limit class names.** `sign-in` is the one extra class identity asks for and is in foundations' five classes.
- **Backlog arithmetic.** 35/37/51/67/41/34 = 265; gate 11 + 9 + 0 + 17 + 0 + 0 = 37; 191 stories in phases 1 to 3; second round 265; totals 532 then 533 with F-36. Foundations' F-01 to F-34 lists add to 34 (10 + 5 + 9 + 5 + 4 + 1).
- **Foundations internal counts.** Twelve `core_` tables, seven screens, six states in tab 3, six principles, seven questions, eight "what the other workstreams must do" items all agree with their content.
- **Mermaid diagrams.** Module, migration, unit-of-work, event, job and external-call diagrams in `F:05` match the numbered rules except the `failed` job state noted in finding 32.
- **Not checkable here:** the second-round specifications (front of house, spaces, bar, training, membership, communications) are not in the repository, so their id prefixes, facts and `uses` lists could be checked only against what foundations and the backlog say of them.
