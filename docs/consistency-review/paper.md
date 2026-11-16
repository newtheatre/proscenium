# Design paper (docs/design-paper/, 22 files) consistency findings

Reviewed all 22 paper files in full against the six specifications under /home/user/proscenium/docs/specs. Verified by grep and targeted reads; I did not edit anything under /home/user/proscenium. Paths below are relative to /home/user/proscenium/docs. "Paper" means design-paper/, "F" is specs/foundations, "ID" identity, "C" core-domain-and-public-site, "BO" box-office-payments-ledger, "FB" form-builder, "UI" interface-and-wireframes. Foundations "02-formats" means foundations/02-formats.md, whose closing rulings prevail.

## Summary

- HIGH 4, MEDIUM 18, LOW 10 (32 findings, plus a short list of defects I noticed in the specs that are outside my area).
- Most important:
  1. **Part B's "What the proofs have shown" table and the Next-stage tab are stale** (findings 1, 2): one-step deploy "in progress", last seat "still to run on a deployed database", Windows/macOS "still need a CI matrix", "nothing here has started". Specs and the status tab record all four proofs as passed and D4 decided Linux-only.
  2. **The module catalogue and Part B disagree with the specs on what a module is**: Payments "needs Box office or Bar" (the paper's own Part B and Foundations say no either-or; Payments requires Finance), "sixteen modules" while `forms`, `membership-fees` and `core` exist as further modules, and the form builder is "part of the core" while Foundations makes `forms` a separate always-on module (findings 3 to 5).
  3. **The build backlog's totals and its order of work have not absorbed later rulings**: the headline table says 265/35/34 but the specs and the paper's own second-round section say 36 Foundations stories, 36 Interface stories and 533 in all; F-36, UI-10 and the "Later" stories C-22/C-26 are mis-placed or missing from the order of work; Bar's phase-3 move is "proposed, waiting on X1" in the backlog and "by Matt's decision" in the roadmap (findings 8 to 12).

Counts I checked and found correct are listed at the end.

---

## A. Stale status and proofs

**1. HIGH. Proof results in Part B are out of date.**
- Side A: paper/05-part-b-conventions.md:100 "merged two upstream releases"; :101 "Windows and macOS still need a CI matrix once a repository exists"; :102 "Last seat | 11 of 11 cases passed on local D1 | Still to run against a deployed database"; :103 "One-step deploy | In progress | None yet".
- Side B: paper/11-design-stage-questions-and-status.md:17 "owned paths over four releases ... one-step deploy locally" and "The one-step deploy proof is complete: the button created every resource with nothing typed"; :20 "The last-seat proof is complete: 11 of 11 cases passed on a deployed D1 database over 20 rounds each, while the unprotected control oversold in 19 of 20 rounds"; :46 D4 "no Windows or macOS test runs"; specs/foundations/13-proofs.md ("A fourth release, added after the first three"); specs/box-office-payments-ledger/11-proof-last-seat-on-d1.md:9 "Confirmed on deployed D1, 16 November".
- Prevails: the specs and the status tab (D4 is a Matt decision). Fix: rewrite the table to four releases, Linux only (no matrix), last seat passed on deployed D1, deploy passed with the finding that the button's copy starts a fresh history (F-35). Note the proof releases are counted three ways across documents (paper Part B "two", F 12-1 line 5 "three releases", F 01-overview:34 and F 13-proofs "four"); four is right.
- Owner: paper 05-part-b; also F 12-1 (line 5) for "three".

**2. HIGH. Next-stage tab says nothing has started and lists a retired proof.**
- Side A: paper/10-next-stage-detailed-design.md:3 "Nothing here has started; it waits for Matt's go-ahead."; :45 "Do unit, integration and browser tests run on Windows, macOS and Linux"; :21 "Front of house, Spaces, Bar, Training, Membership and Communications are specified in a later round".
- Side B: paper/11-...:3 "All six specifications exist as drafts"; paper/12-...:120 "Six more modules now have specifications"; D4 (11:46) Linux only.
- Prevails: tabs 11 and 12. Fix: mark the stage as done, the proof as Linux-only, and record the second round (or mark the tab as historical).
- Owner: paper 10.

**3. MEDIUM. Tab 11 and tab 12 contradict each other about the second round.**
- Side A: paper/11-...:133-135 "The second round of specifications (Front of house, Spaces, Bar, Training, Membership, Communications) follows."; :130 "The Bar specification in the second round will be the first to use it."; :124 "it departs from this paper's Part A, which will be amended once you confirm" (Part A line 46 of 04-part-a-features.md is already amended to draft/scheduled/cancelled/completed, and C 10-questions:23 still quotes the old "draft, on sale, cancelled").
- Side B: paper/12-...:120-133 six second-round modules now specified, 265 more stories.
- Prevails: tab 12 (newer). Also paper/11:3 "As of 16 November" has no second-round status and says "Every question on this tab is now answered, and nothing here waits on you" while tab 12 refers to open questions X1 and X4.
- Owner: paper 11. Also C 10-questions-for-matt.md:23 (stale quote of Part A).

**4. MEDIUM. Reference to a tab that does not exist.**
- paper/12-...:122 "The questions they raise are in the tab 'Second round: questions and status'." No such file exists in design-paper/ (22 files; 11 is the only status tab) and 01-overview's tab list has no such entry. X1 and X4 (12:138, 139) therefore cannot be looked up.
- Fix: add the tab or remove the reference and put X1/X4 in tab 11. Owner: paper 12, 01-overview.

**5. MEDIUM. Overview tab index is incomplete.**
- paper/01-overview.md:31-43 lists 11 tabs but not "Next stage: detailed design", "Design stage: questions and status", "Build backlog and shared glossary", "Lessons from Mailflare", or the Research sub-tabs by name. It also says "Roadmap | Eight phases" (correct) and "Sixteen modules" (see 6). Readers are not told where Matt's questions or the backlog live.
- Fix: add rows. Owner: paper 01.

## B. Module catalogue, dependencies and "core"

**6. HIGH. Payments' dependency is wrong and contradicts Part B.**
- Side A: paper/04-2-module-catalogue.md:24 "| Payments | ... | Box office or Bar |" and :26 "Bar and kiosk ... | Payments".
- Side B: paper/05-part-b-conventions.md:86 "There are no either-or dependencies, so Box office and Bar each require Payments"; BO 05-interface-to-other-modules.md:5-9 "`payments` requires `finance`", "`box-office` requires `payments`, `finance`", and "No loop ... follows the Foundations rule that Box office and Bar each require Payments, with no either-or dependency"; F 06-interface "Bar ... requires payments and finance".
- Prevails: Foundations and BO. Fix the catalogue "Needs" column: Payments needs Finance; Box office needs Payments and Finance (Core is not enough); Bar needs Payments and Finance; Membership needs the form builder (`membership` requires `forms`) and its fees part needs Payments and Finance. Owner: paper 04-2.

**7. MEDIUM. "Sixteen modules" no longer matches the module list.**
- Side A: paper/04-2-module-catalogue.md:3 "Sixteen modules sit on the core."; 01-overview.md:35 "Sixteen modules, each with its capabilities".
- Side B: F 02-formats.md:107 (one always-on module `core`, with identity, domain and interface as areas); F 12-1 layout "forms/ always on, not switchable"; F 06-interface "Membership (second round) ... Two modules: `membership` ... and `membership-fees`"; BO overview "Three modules: Box office, Payments and Finance" (these three are already separate rows in the catalogue). So the design has the 16 catalogue modules, plus `forms`, plus `membership-fees` (18), plus `core`.
- Fix: state the count and which entries split or are not switchable. Owner: paper 04-2, 01-overview.

**8. MEDIUM. The form builder is "part of the core" in the paper but a separate module in the specs.**
- Side A: paper/04-3-form-builder.md:3 "A full form builder with a strong engine is part of the core"; 04-part-a-features.md:80 layer 3 "Through the form builder ... fields to productions, people and bookings".
- Side B: F 02-formats.md:108 "New manifest field `switchable: false` for a module that has its own layer and id but cannot be switched off. `forms` is the first"; FB 03-data-model.md:3 "all prefixed `forms_`"; F 12-1 "forms/ always on, not switchable". F7 (paper/11:106, FB) puts custom fields first on "Production, person and venue", not bookings, and FB-503 custom fields is "Later" (FB 08-stories.md:200).
- Prevails: Foundations ruling (a separate always-on module). Suggested wording: "an always-on module, `forms`, beside core". Fix "bookings" to production, person and venue first. Owner: paper 04-3, 04-part-a.

**9. MEDIUM. What the form builder delivers in phase 4 is narrower than the paper says it does.**
- Side A: paper/07-roadmap.md:21 "It arrives before the modules that lean on it (membership applications, booking extras, incident reports)"; 04-3-form-builder.md:21-27 lists custom fields, pickers (including "an inventory item"), "Answers can map to real fields", "Payment: a form can end in a charge", and field type "signature"; 04-3:7-17 table lists "Audition sign-up ... A form attached to a production", "Questions at checkout ... A form attached to a ticket type".
- Side B: FB 08-stories.md:196-209 "Later": FB-501 slots, FB-502 `addResponse`, FB-503 custom fields, FB-504 pickers (person, production, performance, space only; no inventory item), FB-505 bindings, FB-506 outcome action, FB-508 payment; FB 02-scope.md:10 question types "Text, number, money, date and time, choice, yes or no, email, phone, address, file, rating, consent" (no signature); paper/12:139 "Proposed, waiting on question X4: FB-501, FB-502 and the mechanism half of FB-506 move forward with Membership as the first host"; FB 08-stories.md:218 "`box-office.checkout-questions` is added to the box office after both exist".
- So in phase 4 a form can be built, filled in and reviewed on its own, but cannot yet be attached to a host (slots are later). The roadmap's claim of arriving "before the modules that lean on it" holds only if X4 is accepted. Not a contradiction yet, but it will be copied wrongly. Fix: add a release column to 04-3 or a "first release / later" note; replace "signature" with "consent" or add it to the spec; drop "inventory item" or add it to FB-504.
- Owner: paper 04-3, 07-roadmap; FB 02-scope if signature is wanted.

## C. Conventions (Part B) against Foundations

**10. MEDIUM. One queue / one cron.**
- Side A: paper/05-part-b-conventions.md:87 "One cron trigger and one queue for the whole Worker."; :13 "Queues | Email sends, imports, report builds".
- Side B: F 12-design.md:16 bindings `JOBS_PROMPT` and `JOBS_BULK` (queues, each with a dead-letter queue), plus F 02-formats.md:121 "Jobs run in two lanes", :211 "a second queue binding, `EMAIL_EVENTS` ... 'One queue' in older wording now means one queue for the platform's own jobs".
- Prevails: Foundations (explicit). Fix paper wording to "one cron trigger; two job lanes, each with a dead-letter queue, and one email-outcome queue". Owner: paper 05-part-b.

**11. MEDIUM. KV used for sessions.**
- Side A: paper/05-part-b-conventions.md:12 "Cache and sessions | KV".
- Side B: F 12-design.md:20 "KV holds only things that can be rebuilt ... Nothing in KV is ever the only copy of a fact"; ID 03-data-model (table `core_sessions`, prefix `ses`, in the F prefix index); paper/05-2:11 "Sessions are revocable on the server".
- Prevails: Foundations and Identity (sessions are D1 rows). Fix the table: "Cache (rebuildable data only)". Owner: paper 05-part-b.

**12. MEDIUM. `site/` described as a Nuxt layer; deploy configuration in the wrong file.**
- Side A: paper/05-part-b-conventions.md:40 "`site/` | Theatre | A Nuxt layer with the highest priority"; :41 "`site.config.ts` | Theatre | Deploy configuration: Worker name, domain, resource names"; :46 "Deploy identifiers live in `site.config.ts`"; :47 "Layers give override-by-filename"; :112 "Set deploy configuration: domain, resource names, secrets"; paper/10:43 "override pages from a `site/` layer".
- Side B: F 12-1-repository-and-owned-paths.md:48-49 "`site.config.ts` THE THEATRE'S. Release channel and build-time choices." and "`wrangler.jsonc` THE THEATRE'S. The Worker's name and domain. Nothing else."; F 13-proofs.md Finding 1 "`site/` must be the Nuxt project itself, not an extended layer"; F 02-formats.md:145 "The theatre's paths are `site/app/...`, `site/server/...`, `site/content/...` and `site/layers/x-*/`".
- The paper itself records the finding at 05-part-b:100 but did not correct the table rows, the "Layers give override-by-filename" bullet or the extension-point list. Prevails: Foundations 12-1 and the proof. Also F 12-1 says "no hand-kept Wrangler file" nowhere, but the paper says (line 24) "no hand-kept Wrangler file" while F lists a committed theatre `wrangler.jsonc`; one of them should say what is generated and what is committed (F 12-1:105 "the Wrangler deploy configuration ... not committed" versus its own layout line 49).
- Owner: paper 05-part-b (rows 40, 41, lines 24, 46, 47, 112), paper/10 proof table; F 12-1 for the wrangler contradiction.

**13. LOW. Repository table puts migrations and starter content in the wrong places.**
- Side A: paper/05-part-b:38 "`layers/<module>/` ... pages, server routes, schema, migrations, ..."; :44-45 "Upstream ships `site/` almost empty ... Starter content lives in `examples/` and is copied in by the first-run setup".
- Side B: F 12-1 layout: migrations are a top-level `migrations/` folder ("UPSTREAM. Generated; one folder per migration") with a separate `site/migrations/`; :53 "Upstream ships `site/` as a working starter (a home page, a what's on page, a sample content page) and then never changes any file under it again. Improvements to the starter go to a separate `examples/` folder that a theatre can copy from."
- Prevails: Foundations. Owner: paper 05-part-b.

**14. MEDIUM. Previews, upgrade tests and module-isolation tests differ from Foundations.**
- Side A: paper/05-3-engineering-releases-and-docs.md:24 "**Preview:** every branch deploys to a preview bound to preview-only resources"; :17 "Every release is tested as an upgrade from the previous two releases"; :18 "The suite runs with each module switched off in turn."
- Side B: F 12-3-ci-and-test-harness.md:60 "Preview deployments for pull requests are off by default, because a preview shares the production database; a theatre that wants them connects a second Worker with its own resources."; F 10-test-plan.md:69 "each released version to latest (a stored snapshot per release)" (every release, not the previous two); :36 only "A module's suite fails when a module in its `uses` is switched off".
- Prevails: Foundations (owning spec and later). Owner: paper 05-3 (and 03-lessons-from-mailflare:39 "Preview deployments with their own resources" is Mailflare's practice, which is fine).

**15. MEDIUM. Tests "on any platform" versus D4.**
- Side A: paper/05-3:14 "Tests run locally on any platform"; paper/02-lessons-from-proscenium.md:29 "Tests run locally on any platform against the real runtime".
- Side B: paper/11-...:46 (D4) "no Windows or macOS test runs. Linux is the supported system for tests, locally and in CI."; F 12-3 and F 13-proofs.md:12.
- Prevails: D4. Fix: "on Linux, locally and in CI, without an account". Owner: paper 05-3, 02.

**16. MEDIUM. Backups and migration failure behaviour.**
- Side A: paper/05-1-data-settings-and-permissions.md:11 "A backup to R2 is taken before migrations run. A failed migration leaves the previous version serving."; 05-part-b:14 "nightly backup"; 06-setup-...:38-39 "the last backup ... Backups run nightly to the theatre's own file store and can be downloaded."
- Side B: no specification mentions backups at all (`grep -ri backup` over specs finds only ID 04-states-and-rules.md:270 "The retention of backups is workstream 1's setting"; Foundations has no such setting, task, story, health check or screen). F 12-2-upstream-merges.md:73 "Nothing is applied (one batch). The site stays on the maintenance page ... redeploying the previous version restores service" and F 09-stories.md F-28 "a failed migration leaves the database unchanged"; the site is not served by the previous version, it shows the maintenance page.
- Prevails: the paper states a commitment no spec delivers, and the migration behaviour contradicts. Decision needed: either add backup stories and a setting in Foundations (and the retention setting Identity points at), or drop the claims. Behaviour on failure: Foundations prevails.
- Owner: Foundations (stories, settings, health check) and paper 05-1, 05-part-b, 06.

**17. LOW. Heading and coverage of the "Amended by the foundations specification" section.**
- paper/05-part-b-conventions.md:83 "(draft 1, 16 November 2026) ... where the two differ it wins." Foundations is complete and has had two further rounds of rulings. The section lists the early rulings and three later ones (line 94) but not: scoped ids `<prefix>_<26 characters>` (Matt's decision D6, which paper/05-1:24 "Identifiers are opaque and stable" does not state), reserved address prefixes (`/account`, `/members`, `/console`, `/live`, `/book`, `/sign-in`, `/setup`, `/api`, `/files`, `/whats-on`, `/shows`), the lanes and email-outcome queue (finding 10), `core.requirement`, internal events and webhooks (Matt's C9), and "the Windows ... Linux only" decision. Without them the paper's Part B still reads as Foundations draft 1.
- Fix: drop "draft 1", add a one-line list of binding rulings pointing at the end of F 02-formats.md. Owner: paper 05-part-b, 05-1.

**18. LOW. Test and command list differs.**
- paper/05-3:10 "Commands are the same in every module: `dev`, `preview`, `build`, `typecheck`, `lint`, `test`, `check`." versus F 12-3-ci-and-test-harness.md:26-34 `dev`, `check`, `test`, `test:browser`, `db:generate`, `verify` (no `preview`, `typecheck`, `lint` or `build` row; "lint, types and every conformance check" are one `check`). Also "the same in every module" is not what F says (one repository, repository-wide commands). Prevails: F. Owner: paper 05-3.

## D. Accounts, sign-in and security against Identity

**19. MEDIUM. Sign-in methods offered.**
- Side A: paper/05-1-data-settings-and-permissions.md:67 "Sign-in | Passkey, email link, Google, Microsoft"; paper/05-2-security-privacy-and-interface.md:7 "Passkeys first. Password, email link and identity-provider sign-in are options a theatre enables."; :18 "Turnstile on registration, sign-in, password reset and guest checkout".
- Side B: ID 02-scope.md:33 "Passwords, Microsoft sign-in | Not in the first release"; paper/11-...:58 (I4, as recommended) "Not in the first release. A sign-in method is a declared point, so one can be added"; paper/08-decisions.md:12 "Passkey plus email link, with Google as the first identity provider". Also I11 (paper/11:65) "a managed domain's addresses ... No: the provider only".
- Prevails: Matt's decision and Identity. Fix: first implementations are passkey, emailed link and code, Google; password and Microsoft later; drop "password reset" from the Turnstile list until passwords exist. Owner: paper 05-1, 05-2.

**20. LOW. "Shadow accounts" and self-merge.**
- Side A: paper/04-part-a-features.md:31 "Shadow accounts for people recorded before they ever sign in, such as a trainee on a paper register."; paper/04-1-accounts-audience-and-members.md:32 "it offers to link, and merging two accounts is one confirmed step."
- Side B: Identity's word is "unclaimed account" (paper/12:99 glossary owner list); `grep -ri shadow specs` finds nothing. Paper/11:63 (I9) and ID-34 (ID 08-stories.md:236, later): a person merging their own two accounts is later; staff merge is the first release (ID-32). No spec has an automatic "offer to link on a similar name or address".
- Fix: "unclaimed accounts"; say that staff merge first and self-merge later; remove or park the automatic offer. Owner: paper 04-part-a, 04-1.

**21. LOW. Preset names differ between Foundations and the paper/Identity.**
- Side A: paper/04-part-a:17 "a student society, an amateur company and a small professional venue"; 05-1:49 "student society, amateur company, small venue"; ID 07-settings-and-abilities.md:70 the same three.
- Side B: F 07-screens.md:25 "A preset (for example a student theatre, a receiving house, a society with no building)".
- Prevails: Identity (owns presets). Owner: F 07-screens (not the paper). Counts of preset roles agree (14 + welfare-lead = 15, paper/12:146).

## E. Roadmap and backlog against stories

**22. HIGH. Backlog headline numbers are not current.**
- Side A: paper/12-build-backlog-and-glossary.md:9 "F-01 to F-35 | 35", :14 "UI-01 to UI-34 | 34 | 0 | 24 | 10", :15 "**All** | **265** | **37** | **181** | **47**"; :17 "phases 1 to 3 hold 191 stories: 37 gate and 154 others"; :23 "F-01 to F-10 ... and F-34".
- Side B: same file :133 "Interface grew from 34 to 36 ... UI-35 and UI-36", :154 "F-36 (first release) ... Foundations is now 36 stories, so the total is 533"; UI 07-stories.md:3 "The interface backlog is 36 stories: 24 in the first release, 11 later, and one (UI-36) whose release follows the bar's"; F 09-stories.md:5 "Thirty-four stories" (and F 01-overview:20 the same; F-35 appears only as prose at :56 and F-36 appears nowhere in tab 7, only in 02-formats.md:202).
- The arithmetic is internally right in each place (rows sum to 265; 265 + 265 second round = 530 + F-36 + UI-35/36 ... : first-round 267 after UI growth, 268 after F-36, 268 + 265 = 533), but the headline table, the "191" figure and the Foundations row are the old figures, and F-36 is not in the Foundations spec. Fix: update the table (Foundations 36 with F-36 in "rest of first release", Interface 36), the "191" figure (192 with F-36, 193 with UI-35 if first release, check), and add F-36 as a story in F 09-stories.md (and bump the F 01-overview line). 
- Owner: paper 12; F 09-stories, 01-overview.

**23. MEDIUM. Stories missing from or mis-placed in the order of work.**
- Missing: F-36 (rate limits in a shared store, needed before the first release for sign-in and public forms, 12:154) is in no phase; UI-10 ("An officer sees what is waiting on a menu entry", UI 07-stories.md, phase 3) is in no order row (UI first-release phase 3 stories are 05, 06, 10, 20, 21, 22, 23; the backlog lists 05, 06, 20, 21, 22, 23); F-25 and F-29 are "later" per the count (Foundations row 2) but the Foundations spec marks nothing later.
- Mis-placed: phase 2 order 1 (12:41) lists "C-20 to C-22 (vocabularies), C-23 to C-26 (files)" but C-22 and C-26 are "Later" in C 08-stories.md (C-14, C-15, C-19, C-22, C-26, C-33, C-34, C-44 are the 8 later). Phase 2 order 3 correctly excludes C-44 but not stated for C-22/C-26.
- Foundations spec says (09-stories.md:5) "the first two groups come before any other workstream can build" (F-01 to F-15), while the paper's gate is F-01 to F-10 and F-34 with F-11 to F-15 in phase 1 order 4 (12:23, 12:33). Not a build error but the two disagree on what must come first. The Identity gate (nine stories, named only in the paper) is also not marked in ID 08-stories.md, which says only "nine of them needed at the gate" (line 3): the paper's list ID-01, 02, 07, 10, 22, 23, 28, 29, 37 has no counterpart in the spec.
- Fix: place F-36 and UI-10; correct the two C ranges; ask Foundations and Identity to mark their gate stories. Owner: paper 12; F 09-stories; ID 08-stories.

**24. MEDIUM. Roadmap and backlog disagree on the Bar's move into phase 3.**
- Side A: paper/07-roadmap.md:35 "Ten bar stories (BAR-01 to 05, 10 to 12, 14 and 22 ...) join it straight after Box office's desk stories BO-30 to BO-36, by Matt's decision ... The rest of the bar follows in the next phase."
- Side B: paper/12-...:138 "Proposed, waiting on question X1: BAR-01 to 05, 10 to 12, 14 and 22 join phase 3 after Box office's desk stories".
- Same ten stories, one says decided, one says proposed and waiting. Also "the rest of the bar follows in the next phase" (phase 4) but the roadmap table (07-roadmap.md:12-13) puts Bar in phase 5 and phase 4 holds only Front of house and the form builder. Also phase 3 row (07-roadmap.md:10) was not updated to include FH-01 to 04 or the bar stories; only the amendment paragraph.
- Prevails: the roadmap (later timestamp, states Matt's decision); update tab 12. Fix "next phase" to phase 5. Owner: paper 07, 12.

**25. MEDIUM. Phase 1 lists accounts with the members' experience; the backlog puts it in phase 2.**
- Side A: paper/07-roadmap.md:8 phase 1 "accounts with the audience and members' experiences".
- Side B: paper/12-...:44 phase 2 order 4 "ID-05, 06, 08, 12, 15, 16, 18 to 21, 24, 30, 35 | Guest accounts, the members' area, data download, erasure | Core's notifications and files; the production-team fact". ID-18 to ID-21 (audience and members) are in phase 2. Also order 7 (12:35) says "passkeys, recovery" but ID-08 (recover a lost passkey) is phase 2, only ID-09 (break-glass) and ID-14 (recovery codes) are in phase 1.
- Prevails: the backlog (it is dependency-checked). Fix roadmap phase 1 wording. Owner: paper 07.

**26. MEDIUM. Roadmap leaves most of Finance unscheduled.**
- Side A: paper/04-2-module-catalogue.md:11 Tier 1 "Finance (the ledger)"; :160-166 Finance also lists "Budgets per production, department and season", "Expense claims with receipts and approval", "Invoices in and out", "Exports to an accounting package".
- Side B: roadmap phase 3 (07-roadmap.md:10) "Finance ledger"; no phase mentions budgets, expenses or invoices (phase 6 lists Inventory, Fundraising, Governance, Reports; phase 7 mentions only per-show budget by implication); BO 02-scope.md:39 "Budgets, expense claims, invoices, exports to accounting packages, bank and payout reconciliation | The rest of Finance, a later round".
- The paper's "Finance" module is promised but has no phase. Fix: name the phase (with Spaces/Bar in phase 5?) or mark as later. Owner: paper 07; decision: unclear, needs Matt.

**27. LOW. Roadmap phase 0 and tab 12 intro.**
- paper/07-roadmap.md:7 "The detailed design is written as six specifications" (twelve exist after the second round); paper/12-...:3 "As of 16 November 2026, after all of your answers ... six specifications" then the second-round section. Prevails: tab 12's second-round section. Owner: paper 07, 12.

**28. LOW. Bounce reporting is called unverified in the paper but ruled in Foundations.**
- paper/12-...:140 "what Cloudflare Email Sending reports for bounces, complaints and volume. The last is an open research item and is unverified today."; C 11-sources.md:67 "Not checked against documentation".
- F 02-formats.md:211 states as fact that Email Sending reports bounces, complaints, failures and rejections through an event subscription to a queue and adds a binding for it (with a setup step). The paper and Core still call it unverified; either the Foundations ruling needs a source in F 14-sources.md or the paper wording should say "ruled, still to prove". Owner: F 14-sources / C 11-sources / paper 12.

**29. LOW. Paper research tab still lists a finished check.**
- paper/09-2-cloudflare-limits-and-costs.md:46 "Whether a deploy button can create every resource in one step for a fork." (done, proof 2 and paper/07-roadmap.md:29, 33); the Durable Object and dead-letter queue are the part left. Owner: paper 09-2. Also paper/03-lessons-from-mailflare.md:58 "Data: to be added as a rule" - it is now a rule (05-1:17).

## F. Spec-owned promises in the paper with no home, and glossary points

**30. MEDIUM. Paper commitments that no specification delivers.**
- 30-minute fork-to-site target (paper/07-roadmap.md:8 gate, 06-setup:13 "under 30 minutes"): no story in F 09-stories.md (F-11, F-13) carries a time or a test.
- Demo mode (paper/06-setup:11 "A demo mode fills the site with sample productions", 04-4:24 "Demo data for evaluation and training"): `grep -ri demo` over foundations, core, identity finds nothing; UI-29 is "practice mode" for trainees, a different thing.
- Handover checklist for a new site owner (paper/06-setup:41): none.
- Backups (see 16).
- Paper 04-2:84-90 "The last seven items" of Box office: BO 02-scope.md:34 says widget, wallet tickets and agent/promoter allocations are "Listed in the later backlog in part 7" but BO part 7 has no such stories (the Later list is BO-35, BO-64, FIN-07); a customer record with order history and an abandoned-basket reminder are not in BO scope or stories at all; gift vouchers and donation at checkout are roadmap phase 6 (matches).
- Fix: either add stories or mark these items as unscheduled in the paper. Owner: paper 04-2, 06; F 09-stories; BO 02-scope/08-stories.

**31. LOW. Glossary rulings not applied in the specs they bind.**
- paper/12-...:84 "hold | ... Always 'erasure hold' or 'seat hold'" and :85 "'Account claim' and 'capacity claim'": BO's own stories and tables use bare "hold" and "claim" (BO-36 "I hold a number of seats", `holds`, `claims`; ID uses "erasure hold" correctly). The ruling's effect on table names is not stated; it should say "in prose".
- paper/12-...:89 "'Draft' alone only for core's state; 'draft version' and 'draft response' in forms": FB-606 "A shared draft" and FB 08-stories "Drafts and resuming" use bare draft.
- paper/12-...:103 the Interface words list "the page types (List, Record, Form, Settings, Home, Steps, Live, Editor)" (eight) while UI 05-2-page-conventions.md:3 "seven page types" with the Editor "a named layout" (line 82).
- Owner: paper 12 (clarify scope of the rulings) and the named specs.

**32. LOW. Payment methods named differently.**
- paper/04-2-module-catalogue.md:94 "an in-person card reader, online card, cash, invoice, and none"; paper/05-1:66 "In-person reader, online card, cash, none"; BO 02-scope.md:24 "four first providers (online card, in-person reader, cash, none)" plus "attested card" as a first provider (paper/11:34 B2: "Cash and attested card always, then Stripe online, then the SumUp reader"). The paper's catalogue lists "invoice" which no spec has; "attested card" appears nowhere in Part A or Part B. paper/09-3-payment-providers.md:31 "SumUp makes SumUp the natural first in-person provider" while B2 orders attested card, then Stripe online, then the SumUp reader. Prevails: BO and B2. Owner: paper 04-2, 05-1, 09-3.

---

## Noticed in the specs while checking (outside my area, for the owners)

- BO 01-overview.md:15 "37 tables, 59 stories (51 in the first release), 52 named never-regress tests, 9 questions" against BO 03-data-model.md:83/419 (38 tables), 08-stories.md "67 stories ... 61 in the first release" and 10-questions "All eleven questions"; BO 03-data-model.md:5 "37 tables"; BO 10-questions-for-matt.md:5 "Nine questions". The paper's 38 tables and 67 stories are the correct figures.
- BO 04-states-and-rules.md:307 and 07-settings-and-abilities.md:66 still describe `finance.income.recognise` as a setting, while 07:180 says it is removed (B4).
- FB 03-data-model.md:153 "A check constraint allows person_id or respondent_email, never both" against F 02-formats.md:209 "the rule 'never both' is withdrawn".
- F 01-overview.md:35 "Proof 2 ... Passed locally. A real deploy on an account is question 5" and :37 "Waiting on Matt: six of the seven" against F 13-proofs.md and 11-questions (all decided, deploy passed on a real account). F 09-stories.md F-22 `:setting{key}` against F 02-formats.md:197 `:setting{name="..."}`; F 02-4 code sample passes options second while "As built" #1 says columns second.
- ID 01-overview.md:31 "29 settings, 17 abilities, 14 preset roles" against ID 07-settings-and-abilities.md:3 "29 settings and 16 abilities" and :122 "That makes 17 rows"; ID 05-interface:216 `CORE_TURNSTILE_SECRET` against the same line's `CORE_TURNSTILE_SECRET_KEY`.
- C 10-questions-for-matt.md:23 quotes the paper's Part A as "draft, on sale, cancelled" (Part A has since been amended).

## Checked and consistent

- Paper counts: 16 catalogue rows; 10 "Beyond Proscenium" rows; 11 decisions (rows = 11); 7 comparable systems; 8 roadmap phases (0 to 7); "last seven items" of Box office = 7; "thirteen that shape the most" = 13 rows; question totals (C 9, D 7, I 12, B 11, F 10, U 9) match each spec's own questions tab; status tab outcomes for C1, C3, C7, C9, B3, B4, B6, D4, D6, D7 match the specs.
- Backlog table arithmetic: every row (stories = gate + rest + later; BO 17 + 44 + 3 + 3 = 67), column totals 265/37/181/47, "191 = 37 + 154"; second-round rows (46, 48, 44, 34, 55, 38) sum to 265 with 31 gate, 164 first release, 70 later; 267 + 265 = 532, +1 = 533.
- Per-spec story counts: ID 37 (30 first, 9 gate, 7 later); C 51 (43/8, Later list matches C 08-stories); BO 67 (61 first, 17 gate, BO-35, BO-64, FIN-07 later, BO-70 to 72 seating, R-1 to R-7 and PAY-07 added); FB 41 (27/14, FB-101 to 106 engine); UI 36 (24/11/1); gate list for BO matches the story tags.
- Table counts: F 12, ID 17, C 26, BO 22 + payments 9 (with `pip`) + finance 7 = 38, FB 16 (+1 later `fcoa`): the paper's 109 is the sum; the "where the list is" tab and heading names exist (F tab 2 and tab 4 index of prefixes, ID "Id prefixes", C "All 26 tables and their id prefixes", BO "Id prefixes", FB "Id prefixes"). Bar's row (20) is already out of date against F 06-interface (Bar added `btab` and `brrv`, so 22 tables); the Bar spec is not in the repository to confirm.
- Performance states draft, scheduled, cancelled, completed and "sale state is Box office's" (04-part-a:46 against C 03-data-model.md:120); capacity on the performance (nullable, takes the space's).
- Reserve-now-pay-on-arrival, one payment covering tickets and another module's items, buyer self-service cancellation off by default and built in the first release (paper/07, 11, 12 against BO R-1 to R-7, PAY-07, BO-22).
- Webhooks in the first release (C-49 to C-51), `/whats-on/<slug>` current and `/shows/<slug>` past (C7), scoped ids (D6), ledger as double-entry append-only, refunds by original method, B4 fixed income rule (finance has no recognition setting), "preset roles stay at fifteen".
- Part B rulings acknowledged in 05-part-b:85-94 (no per-module version, requires/uses, one migration journal per owner, four ways modules talk, unit of work, record types, module-id prefixes, `x-` ids, `credentials`, one append-only erasure update, externalCall) all match F 02-formats.md.
- Payment-fee arithmetic and the 10,000-email cost in tab 09 (£8, £24, £60 baskets; £20 break-even; $2.45).
- Tab names cited in the backlog (F tab 7 stories, tab 2 tables, tab 4 prefix index; BO tab 9 cut order; ID "Id prefixes") exist; BO's cut order matches paper/11 B9.
