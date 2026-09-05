# Foundational decision records

All accepted: three were settled early by the spike outcomes recorded on 26 August, and the
rest at the Phase 0 gate on 26 August 2026 (0019). Accepted records are never edited
afterwards, only superseded.

| # | Title | Gated on |
| --- | --- | --- |
| 0001 | One system, one database | |
| 0002 | Application stack stays Nuxt on Cloudflare Workers | |
| 0003 | The database is D1 | accepted (SP-5 outcome) |
| 0004 | Money is integer pence in one append-only ledger | |
| 0005 | Payment stays on the SU's SumUp flows | accepted (constraint; SP-1 refused) |
| 0006 | Capacity is enforced by the database | |
| 0007 | Sessions are first-party sealed cookies with epoch revocation | |
| 0008 | Google sign-in is Workspace-only; passkeys re-enrol at cutover | accepted (SP-4: one holder, manual) |
| 0009 | Roles expire at the committee year; operational authority derives from facts | workshop role mapping |
| 0010 | Append-only registers are trigger-enforced | |
| 0011 | Erasure is anonymisation in one transaction | |
| 0012 | Policy is configuration, enforced at the write path | workshop defaults |
| 0013 | One notification centre | |
| 0014 | Europe/London everywhere; the show night runs 04:00 to 04:00 | |
| 0015 | Migration is a keyed merge with a module-phased cutover | SP-3 rehearsals |
| 0016 | Testing strategy: invariants first, named regressions forever | |
| 0017 | Bar products sell as serving-size variants | |
| 0018 | Training records semantics and delivery modes | |
| 0019 | The Phase 0 gate passed with provisional configuration defaults | |
| 0020 | Mail carries one of five sender identities on a single sending domain | mailboxes for the five addresses |
| 0021 | The design language is vendored, not extended as a layer | |
| 0022 | Integration tests run on SQLite, end-to-end tests drive Bun.WebView | |
| 0023 | A fellowship is a permanent honour, and its entitlement is a pass | what it covers, guests, erasure |
| 0024 | A settings change records a hash where its value could identify someone | which keys are sensitive |
| 0025 | Configuration is a rule, not a record | where the pass products and opening hours live |
| 0026 | An unverified address cannot sign in, and expires | why sign-in refuses, and what removes the account |
| 0027 | An audit action is registered before it is written | the catalogue, the diff shape and the coverage checker |
| 0028 | A manual audit entry names people by account, and is signed | what may be recorded by hand, and who may sign it |
| 0029 | The end-to-end suites are a separate command | what `bun run test` covers, and what runs nightly |
| 0030 | The old estate's audit history is not imported | why the archive was refused, and what answers a historical question |
| 0031 | A membership is a term, and confirming it never gates money | what membership is, and what a check does and does not block |
| 0032 | The admin surface has one set of component conventions | which component for which job, and what the test holds |
| 0033 | A ledger line's kind is enforced in code | which ledger constraints are permanent, and which are not |
| 0034 | The booking horizon is a number of weeks | how far ahead a member may book, and why not to the end of term |
| 0035 | A multi-row claim asserts its own completeness | why a series batch ends with a statement that looks like a mistake |
| 0036 | An externally arranged room is a request, not a booking | why a room we do not manage is not in the estate, and what supersedes C-103 criterion 2 |
| 0037 | Department leadership is assigned; every other training standing derives | why a lead is a row and a trainer is not |
| 0038 | Notice for a room we do not manage is working days | how three working days are counted, and why a gap in the calendar refuses |
| 0039 | A calendar value is read by its parts, not by its class | why `instanceof` across a package boundary is a trap |
| 0040 | Navigation is shaped by posture, and filtered by ability | the four shells, where a screen's URL comes from, and why the sidebar hides what it hides |
| 0041 | A material change invalidates training, rather than restating an expiry | why a stamped expiry never moves, and what replaces recalculation |
| 0042 | Practice mode is entered from the tool, not granted by a register | why practice windows were withdrawn, and how a member reaches a sandbox instead |
| 0043 | A venue is its own row, never a flagged room | what a venue is, and the one thing attaching it to a room does |
| 0044 | An officer opens a show-night screen without a shift, and is recorded | the one exception to derived authority, and what the record keys to |
| 0045 | A public listing caches until the next thing that changes it | how an edge-cacheable listing still closes booking on the minute |
| 0046 | The rota is planned at a desk and worked on a phone | where show night's console screens live, and what opens them |
| 0047 | A constraint violation is refused by a shared helper, each module keeping its own table | the anchored match against a D1 error, and why the table is not centralised |
| 0049 | A status change audits itself atomically, the predicate on the write, the log and the caller both on `changes()` | why a losing racer's audit stays silent and its caller is refused, not told it succeeded |
| 0051 | Editorial content ships as markdown, and copy the committee has not supplied is marked as a placeholder | the deferred editing surface, and why nothing invented reaches the public site |
