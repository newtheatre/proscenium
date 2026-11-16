# Renamed-names check, after the re-export

Lines in docs/ (outside this folder) that still contain a name owners renamed or removed. A hit is not always wrong: a line may say the name was removed. Checked mechanically with a case-sensitive search ('backup' is case-insensitive).


## `finance.income.recognise`: 0 hits


## `box-office.eligibility`: 2 hits

- specs/foundations/06-interface-to-other-modules.md
  - line 101: Requirement sources so far: `training`, `membership`, and `fact` (any declared fact). No module declares a point of its own for a per-person condition; `front-of-house.eligibility`, `box-office.eligibility`, `bar.price-e
- design-paper/12-build-backlog-and-glossary.md
  - line 76: 4. **Three stories wait on modules from the second round and are built to work without them:** the on-shift bar and door check (UI-05, BO-44, ID-26) wait on Front of house's shift fact, and member pricing (BO-20) waits o

## `unfulfilled_payments`: 0 hits


## `release-minutes-before`: 0 hits


## `core.notification.failed`: 0 hits


## `core.production-section`: 2 hits

- specs/core-domain-and-public-site/05-interface-to-other-modules.md
  - line 150: With the four data points further down, that is thirteen points. An earlier draft had a fourteenth, `core.production-section`, for panels on the production page. It is deleted: the interface specification's `core.record-
- specs/foundations/06-interface-to-other-modules.md
  - line 57: `core.production-section` was withdrawn on 16 November: `core.record-tab` is the one way to add to a record page. `core.account-section` is defined once, by the interface.

## `core.brand.default-mode`: 0 hits


## `core.shells.credit-line`: 0 hits


## `core.live.result-sound`: 0 hits


## `CORE_PROFILE_KEY`: 0 hits


## `core.security.fresh-sign-in`: 0 hits


## `core.sessions.reassert-window`: 0 hits


## `/console/core`: 0 hits


## `Site settings`: 1 hits

- specs/interface-and-wireframes/09-questions-for-matt.md
  - line 20: - **Console group order** is fixed by the platform: Tonight, Programme, Box office, Front of house, Bar, Spaces, Training, Membership, People, Money, Communications, Forms, Reports, System. (Programme was added for core'

## `Let in anyway`: 0 hits


## `backup`: 8 hits

- specs/identity/04-states-and-rules.md
  - line 270: - **Earlier states of the database.** The platform takes no backups of its own (decided by Matt, 16 November 2026). Cloudflare keeps its own history of the database, which holds earlier states for up to 30 days and then 
- specs/foundations/12-2-upstream-merges.md
  - line 78: **No backup of its own.** The platform takes no backup, before a migration or at any other time (Matt, 16 November 2026). Cloudflare keeps its own history of the database for up to 30 days, and a theatre that must go bac
- specs/foundations/05-states-and-rules.md
  - line 40: - **G1.** Migrations run inside the application: at first-run setup, and after an update when an administrator presses Apply on the Updates screen or, if `core.updates.apply-migrations` is `automatic`, on the first reque
- specs/foundations/01-overview.md
  - line 37: | Waiting on Matt | Nothing in tab 9: all seven questions are decided. The platform takes no backup of its own (Matt, 16 November 2026): a theatre relies on the history Cloudflare keeps for its database. |
- design-paper/08-decisions.md
  - line 29: **Backups (16 November 2026).** The consistency review found the paper promised nightly backups that no specification delivered. Matt chose to drop the promise: the platform takes no backups, records no restore points an
- design-paper/05-1-data-settings-and-permissions.md
  - line 11: - **The platform takes no backup of its own (Matt, 16 November 2026); a theatre that wants to go back relies on what Cloudflare keeps for its database.** A failed migration changes nothing: each migration is applied as o
- design-paper/06-setup-branding-and-public-site.md
  - line 39: - The platform takes no backups and promises none (Matt, 16 November 2026). A theatre relies on what Cloudflare keeps for its database, and the platform records no restore points.
  - line 50: - **Backups** are not a platform feature: Matt decided on 16 November 2026 to drop the promise, so no backup story is scheduled.
