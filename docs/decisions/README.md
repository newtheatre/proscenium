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
| 0048 | A notification is one claimed row, updated to its outcome rather than joined by a second | why the claim writes PENDING, and why no trigger or rebuild is needed |
| 0049 | A status change audits itself atomically, the predicate on the write, the log and the caller both on `changes()` | why a losing racer's audit stays silent and its caller is refused, not told it succeeded |
| 0051 | Editorial content ships as markdown, and copy the committee has not supplied is marked as a placeholder | the deferred editing surface, and why nothing invented reaches the public site |
| 0050 | An access profile's special category payload is one encrypted blob | why nine flags are not nine columns, and what a worker secret does that a Secrets Store binding would not |
| 0052 | A table rebuild refuses a copying column that does not resolve | the silent string-literal fallback drizzle-kit's own generated SQL can trigger, and why only the double-quoted form needs a static check |
| 0053 | A typed-fetch call site takes an explicit response generic, never a route-map cast | the route-count recursion behind `TS2589`, why no central compiler or config fix exists, and the trade the explicit generic makes deliberately |
| 0054 | A suppressed message is its own outcome, and still reaches the inbox | why a muted topic is not an undeliverable address, why every topic type declares the inbox, and where a preference default lives |
| 0055 | A `server/utils/` file that `tests/` can reach names its own auto-imports explicitly | why merging the Bun and Nuxt type graphs risks reopening 0053, and why a lint rule is a bigger call than one file's fix |
| 0056 | A retry carries the message it will send again, and gives up visibly | why the rendered message rides on the row rather than its context, why the due time is computed rather than stored, and why an attachment is never retried |
| 0057 | A `server/utils/` file resolves a Nitro-runtime-only value outside the Bun graph, and never imports it, static or dynamic | why a dynamic import only defers the same unresolvable dependency, and the two patterns the estate already uses instead |
| 0059 | A migration writer keyed to a person guards its conflict branch against one already anonymised in the target | why a delete and a scrub need different guards, and the answer proposed for A-123 to confirm or deliberately diverge from |
| 0058 | A ledger line whose kind always belongs to one performance refuses a missing performanceId | four independent writers silently dropping the same column, and why `BAR_ITEM` and `TAB_SETTLEMENT` are not in the enforced list |
| 0060 | A merge refuses outright if either account is already a tombstone | why this differs from a migration writer's per-statement guard (0059), and why it is a refusal rather than `eraseAccount()`'s idempotent no-op |
| 0061 | A held message writes no send-log row of its own; the digest that covers it does | why a claim or an attachment bypasses the hold, why the digest's own send does not re-check the topic preference, and why an entry's retention rides on its digest |
| 0062 | An anonymised holder never admits, on the pass that was theirs | why a pass redemption takes both an app-level refusal and a predicate term, where 0059 and 0060 each took only one |
| 0063 | How this repository rebuilds a table that `check:migrations` refuses | why append-only status is not what governs a rebuild, the hand-authored `__new_x` procedure, why a resolving subquery must leave the copying `SELECT` list, and why a dependent's rebuild needs `HAND_REVIEWED_REBUILDS` rather than a wider `GRANDFATHERED` or a cleverer checker |
| 0064 | A period close is a row appended, never a flag on the ledger | why the lock is a calendar range read by the latest row covering a day, why the refusal is one trigger rather than six call-site checks, and why reopening needs no foreign key |
| 0065 | The training transform imports rehearsal's live history; G-127 stays withdrawn for the Heroku era it actually named | why K-117 and G-127 are narrower than they read, and why the catalogue is authored fresh rather than migrated |
| 0066 | A passkey's second factor is session-scoped, and a modal re-asserts identity rather than forcing full re-entry | why the session records which factor proved it rather than the account, and why the ten routes forcing a full sign-out and sign-in all move onto one modal instead |
| 0067 | A raw statement in a `db.batch` goes through a patched drizzle-orm, and the patch is pinned by its own unit test | why upstream issue 2277 breaks every parameterised `db.run(sql...)` in a batch on D1 only, why 78 call sites are not rewritten instead, and the test that must pass before the patch may ever be removed |
| 0068 | A DELETE route takes its parameters from the path or the query string, never from a body | why reading a body on a DELETE hangs the Workers runtime rather than failing, why the rule binds the caller as well as the handler, and when a POST to a named action is the answer instead |
| 0069 | The SumUp app takes the amount by hand-off, and the till records only a reported outcome | why Payment Switch is inside 0005's boundary when the reader API is not, why nothing posts until the app reports success, why the return leg is a keyed claim rather than a trusted callback, and what a mismatch means |
| 0070 | An imported role grant is a recorded human decision, never a mapped default | why every live old grant is accepted, changed or skipped at a prompt, how `out/role-decisions.tsv` records it, and why an undecided grant fails the build |
| 0071 | A shadow account is hidden from the directory unless looked for | what a shadow account is and why it is not an unverified one, why the import's thousands of guests are hidden the way tombstones are rather than filtered out or badged Unverified, and what counts as looking for one |
| 0072 | Production is rebuilt from a locally built target, under a Time Travel bookmark | how `build.ts`, `dump-data.ts` and `reset-production.sh` replace a hand-run sequence, why seeded rows are left to the migrations, and how a rerun resumes |
| 0073 | An imported pass has no issuer | why `passes.issued_by` is nullable for the import alone, why a sentinel account and a refusal were both rejected, and the 0063 rebuild that carries it |
| 0074 | The pass-admission ticket type is owned by the system | why officers never choose a ticket type's kind, how the one PASS_ADMISSION row is found by kind and minted once, why the write routes refuse it with a 409, and why dropping `kind` for a `tickets.pass_id` is deliberately not done |
| 0075 | The catalogues are imported from the old estate by id, not authored fresh | why rooms, union venues, the training catalogue and ticket types cross by id in one transform, why the reference-map mechanism went, and which fields take the unified default |
| 0076 | Operator documentation is a wiki of one page per screen, with its pictures committed | why the tree, the docs layout and the per-screen help link replace one page per module, why the pictures are captured by a script and committed, and why the collection's own routes are gated by session |
| 0077 | A bar opening is its own planned event, and the till opens without a performance | why a hire night gets its own tables rather than a nullable `shifts.performance_id` or a synthetic performance, the third fact BAR authority resolves on, and why the caller names the venue when nothing is running |
| 0078 | A shift carries its own start and end, and authority holds inside that window | why the times are stamped rather than derived at read time, where the template's per-role override sits, how the window decides a sale's house on a matinee day, and why absolute seconds need no daylight-saving case |
| 0079 | Wastage reasons are a fixed vocabulary in code, with optional free-text detail | why the list lives in `MOVEMENT_REASONS` rather than on a screen or in a table, why an append-only row makes a managed vocabulary the wrong shape, and where the optional detail goes without becoming personal data |
| 0080 | The cutover stocktake sets the trusted balance, and damage is written off rather than repaired | why there is no stock history to import, why the most recent applied stocktake is the only trusted balance, why no documented repair runs as a repair, and why opening stock is worth recording as a delivery first |
| 0081 | A LIKE or GLOB pattern is fifty characters on D1, and `check:migrations` measures every one | why a 67-character CHECK pattern 500d every category write while the schema matched and `EXPLAIN` ran, where the limit is enforced now, why the colour constraint keeps its meaning through `lower()`, and why 0111 rebuilds `bar_categories` on emptiness rather than on 0063's ordering |
| 0082 | A console group splits into Every day and Set-up, and a nav label is the page's own title | why fifty-four items in nine groups interleave daily work with once-a-year set-up, why the group under `/rota/manage` is Rota while the phone shell stays Tonight, why a label and a page title are one string with no exemptions, and why the search box became a story instead |
| 0083 | A multi-size product opens a size sheet from one tile, rather than showing its sizes inside the tile | why a pill per size does not fit a 360 pixel card, what the tile says instead so a second tap is never a surprise, and why neither a full-width tile nor a stored default size was taken |
| 0084 | The member shell is calm, its headings are two sizes, and its pages take a named width | why fifteen expressive headings and five page widths across one shell are a defect rather than variety, why `/passes` and the training catalogue keep the display face, which three widths are named and why the third is not a third posture, and what now fails when a member screen invents its own shape |
| 0085 | Visibly over 25 is a register outcome, and the empty register is rebuilt once to take it | why the till's Challenge 25 prompt gained a first answer, why the register's outcome column takes a third value after all, what makes this the one rebuild of an append-only register 0010 allows, and how 0063's procedure carries the correction chain through it |
| 0086 | Feedback is a queue row, triaged by a daily run outside the worker | why the worker only records a report and never talks to the tracker, why a scheduled run outside it reads the table directly and writes the outcome back conditionally, what that leaves outside the audit trail, and why an immediate notification and a "your reports" list were deferred |
| 0087 | The whole-year period is a year, and a season is Autumn, Spring, StuFF or the Fringe | why the 1 August to 31 July period and its configuration keys are renamed to year, why a season is a dated row of the `seasons` table read by ledger date rather than configured dates or attribution by show, why seasons must not overlap, and which season the public What's on heading names |
| 0088 | A pending role grant is a grant on an account nobody has signed into yet | why granting by email makes a shadow account rather than a second table, why the unique address is the conditional write, why a pending grant is not counted as a holder or by the last-IT-Manager guard, and why 0008's pre-link is a different problem. Accepted 23 September 2026 by the IT Manager |
| 0089 | A message to ticket holders is a booking message, and reaches the address the booking was made with | why the composer's ticket-holder audiences send under two further types rather than the member announcement types, why a plain one carries the Bookings topic, why both may reach a guest's unverified address, and why that reach cannot become a bulk send. Accepted 23 September 2026 by the IT Manager |
| 0090 | The Box Office Manager is the Front of House Manager, and holds one role | why `BOX_OFFICE` folds into `FOH_MANAGER`, the trade-off of price-setting and shiftless refund approval in one grant, how the migration moves grants in place without anyone losing access, and why comp approval is unaffected |
| 0093 | Documentation has three audiences, and the public tier is its own collection | why pages carry an `audience` of public, member or committee, why the public tier is a separate anonymous `help` collection rather than a filter over the gated one (whose dump would publish every page), and why member and committee differ only in navigation. Amends 0076. Accepted 24 September 2026 by the IT Manager |
