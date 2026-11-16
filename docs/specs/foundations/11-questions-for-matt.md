# 9. Questions for Matt

## Seven questions, each with a recommendation

Everything else in this specification is decided and can be built as written. These seven are yours because each changes what a theatre experiences or uses your accounts. Work continues on the recommended option for each until you say otherwise; none of them blocks the other workstreams.

**All seven are now decided (16 November 2026).** Matt accepted the recommendations for questions 1, 2, 3 and 5, and decided 4, 6 and 7 by comment: 1 settings are site-wide only; 2 releases arrive as a pull request in the theatre's repository; 3 migrations are applied by a button, with automatic as a setting; 4 tests run on Linux only; 5 one real deploy on his personal Cloudflare account, removed afterwards; 6 scoped ids, sortable; 7 no promise before 1.0, then nothing breaks within a major version. The sections below are kept as the record of the options.

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | Do settings ever vary by venue, production or performance? | Decided: no. Settings stay site-wide. |
| 2 | How does a theatre receive a new release? | Decided: a pull request opened in its own repository, which it merges. |
| 3 | Are migrations applied by a button or by themselves? | Decided: a button by default, with automatic as a setting. |
| 4 | Where do I run the Windows and macOS test proof? | Decided: not needed. Tests run on Linux only. |
| 5 | May I run one real deploy, and on which account? | Decided: yes, on your personal Cloudflare account, removed afterwards. |
| 6 | What form do record ids take? | Decided: scoped text ids as in Flytower (a type prefix, then 26 characters), sortable by creation time. |
| 7 | What does upstream promise about breaking changes? | Decided: no promise before 1.0; from 1.0 nothing breaks within a major version, at most one major a year. |

## 1. Do settings ever vary by venue, production or performance?

The integrating thread asked me to put this to you in these words: settings stay site-wide; anything that varies by venue, production or performance is a field on that record whose default comes from the setting.

| Option | What it means |
| --- | --- |
| **A. Site-wide only (recommended)** | A setting has one value. If a show needs a different booking cut-off, the performance has its own cut-off field, pre-filled from the setting. Simple to explain, one place to look, and the settings screen is always the truth about the theatre's conventions. |
| B. Settings with overrides | Any setting could be overridden per venue or per production. More flexible on paper, but every read must say for which venue, every screen must show where a value came from, and a successor cannot tell what the rule is without checking several places. |

A costs a little more design per module (deciding which values deserve a field on the record). B costs every module complexity for ever. All five other workstreams have written to A.

## 2. How does a theatre receive a new release?

| Option | What it means |
| --- | --- |
| **A. An update pull request (recommended)** | A scheduled action in the theatre's repository notices a new release, merges it on a branch, resolves the lockfile, runs the checks and opens a pull request with the release notes. The theatre presses merge; Cloudflare deploys. The console's Updates screen links to it. |
| B. Manual only | The theatre uses GitHub's Sync fork control or the command line. Nothing to maintain, but nothing checks the result before it is live, and the lockfile step is by hand. |
| C. Fully automatic | Releases merge and deploy themselves. Least effort, but a theatre could be updated mid-performance, and a breaking release would land unread. |

A is the only one where the theatre both sees what is coming and has it checked first. One caveat: GitHub switches scheduled actions off in a fork until the owner enables them once, so setup includes one click on GitHub; B remains available to anyone who prefers it. Releases come on two channels, stable and beta, chosen in `site.config.ts`; Flytower's two-channel model is the pattern.

## 3. Are migrations applied by a button or by themselves?

| Option | What it means |
| --- | --- |
| **A. A button, with automatic as a setting (recommended)** | After an update with database changes, the site shows a short maintenance page until an administrator opens Updates and presses Apply. A theatre that prefers no pause can set it to automatic. |
| B. Always automatic | The first request after a deploy applies them. No pause, but a database change happens with nobody watching. |

Mailflare applies migrations from its admin update card, which is the model for A. Most releases have no migration and cause no pause either way.

## 4. Where do I run the Windows and macOS test proof?

**Decided by Matt on 16 November 2026: no Windows or macOS test runs.** Linux is the supported system for tests: Workers run on Linux, and the application is seen through a browser, so it depends on the browser and not on the operating system. The test proof is therefore closed as passed. CI runs on Linux only, and the browser tier is where cross-browser coverage belongs (Chromium first; Firefox and WebKit can be added as Playwright projects on the same Linux runner).

A repository for the new platform is still needed for question 5 and for the build itself, but nothing about testing waits on it. The options below are kept for the record.

| Option | What it means |
| --- | --- |
| **A. You create an empty public repository for the new platform (recommended)** | It becomes the real upstream repository when the build starts. I push the proof harness and a CI workflow on a branch; the proof closes when it is green on all three systems. |
| B. A throwaway branch in an existing repository | Quicker, but it runs unrelated workflows and leaves proof code in a product's history. |
| C. Leave it to the first week of the build | No action now. The risk (small, since nothing in the stack is native) is carried into the build. |

## 5. May I run one real deploy, and on which account?

The one-step deploy proof passes as far as it can without an account. Two things only a real run can show: whether the Deploy to Cloudflare button keeps upstream's history (which decides whether setup is one step or two), and whether every resource is created without help.

| Option | What it means |
| --- | --- |
| **A. Your personal Cloudflare account (recommended)** | One Worker, one database, one bucket, one cache namespace and two queues are created, checked and deleted. Nothing touches New Theatre's account. It needs the repository from question 4 and you to press the button, since it signs in as you. |
| B. The New Theatre account | The same, in the account that will one day host NNT's copy. I advise against using it for a throwaway. |
| C. Not yet | The Design tab keeps both routes (one step by button, two steps by fork and import) until the build proves one. |

## 6. What form do record ids take?

| Option | What it means |
| --- | --- |
| **A. Sortable text ids (recommended)** | Every record's id is a 26-character text that sorts by creation time and cannot be guessed. Addresses look like `/console/productions/01JD3K…`. Safe to show, safe to create in the browser before saving, and two sites' data can be merged without clashes. |
| B. Counting numbers | Short and readable (`/productions/412`), but they reveal how many of a thing exist, invite guessing the next one, and clash when data is imported. |

People-facing references that must be short (a booking reference, an asset tag) are a separate, human-friendly code on the record either way. Every workstream's data model is written to A.

**Amended on 16 November 2026 after Matt's comment: ids are scoped, as in Flytower's platform.** There, every id is a short type prefix, an underscore and 26 random base32 characters, for example `box_3kq…`, declared in one list (`packages/schema/src/ids.ts`: customer `cus`, box `box`, session `ses`, audit `aud` and so on), with a validator that accepts only ids of one kind. An id found in a log says what it is, and an id of the wrong kind is refused at the door.

Proscenium takes the same form: `<prefix>_<26 characters>`, for example `ord_01jd3k…` for an order.

- The prefix is declared on the table (`defineTable('box_office_orders', …, { id: 'ord' })`), is two to four lower-case letters, and is unique across the registry; the build fails on a clash. A theatre's own module's prefixes start with `x`.
- `col.id()` makes the id, `col.ref('box_office_orders')` accepts only ids with that table's prefix, and route input validation does the same, so a production id passed where an order id is expected is refused before any query.
- One difference from Flytower, which is the remaining choice: the 26 characters. Flytower's are fully random. I recommend that they sort by creation time by default (the first ten characters are the time, the rest random), which keeps database indexes compact and gives lists a stable order for nothing, and that a table may ask for fully random ids (`{ id: 'ses', random: true }`) where the moment of creation should not show, such as sessions, sign-in links and anything used as a secret. If you would rather every id be fully random as in Flytower, say so; nothing else changes.

**Decided by Matt on 16 November 2026: scoped ids, sortable.** Question 6 is closed. Ids are a type prefix and 26 characters that sort by creation time. A table may still declare a fully random id where the moment of creation should not show, and an id is never used as a secret: a link or code that grants access is a separate random token on the row. The index of prefixes for every table is in part 4.

## 7. What does upstream promise about breaking changes?

| Option | What it means |
| --- | --- |
| **A. Stable within a major version, at most one major a year (recommended)** | Within a major version: database changes only add, settings and abilities are not renamed, published components keep their inputs, and a theatre's own module keeps working. A major version lists every break with what to do, and the previous major gets security fixes for six months. |
| B. No promise before 1.0, then A | The same, but only once the product calls itself 1.0. Honest for an early product; NNT would be the theatre that absorbs the breaks. |
| C. Move fast | No promise. Simplest for upstream, and theatres stop updating. |

I recommend A from the first stable release, with B's freedom during the build itself (versions 0.x), since the fork model only works if merging a release is boring.

**Decided by Matt on 16 November 2026: B, then A.** Before version 1.0 upstream makes no promise: any 0.x release may change the database, the manifest, settings, abilities and published components, and its notes say what broke and what to do. From 1.0 the promise in A holds: nothing breaks within a major version, at most one major a year, and the previous major gets security fixes for six months. The update action and the Updates screen still mark a breaking 0.x release, so a theatre running a pre-1.0 copy is warned before it merges.

## Decided without asking, in case you disagree

- **Bun** is the package manager, as in Mailflare.
- **The audit log is kept seven years** by default; it is a setting.
- **The setup code is a deployment secret**, not something printed in logs.
- **A theatre's own modules are prefixed `x-`** so an upstream module can never take the same name.
