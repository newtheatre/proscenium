# Consistency review, 16 November 2026

A read-through of the design paper and the six specifications against each other, done on the Markdown snapshot in this folder's parent. One reviewer owned each document and cross-checked it against the rest. Nothing in `docs/` outside this folder was changed: these are findings for the owning threads to resolve in the Docs, not edits.

| Area | Findings | High | Medium | Low | File |
| --- | --- | --- | --- | --- | --- |
| Foundations | 41 | 9 | 20 | 12 | [foundations.md](foundations.md) |
| Core domain and public site | 42 | 7 | 20 | 15 | [core.md](core.md) |
| Identity | 41 | 9 | 23 | 9 | [identity.md](identity.md) |
| Box office, payments and ledger | 52 | 8 | 31 | 13 | [box-office.md](box-office.md) |
| Form builder | 26 | 8 | 11 | 7 | [forms.md](forms.md) |
| Interface and wireframes | 31 | 9 | 14 | 8 | [interface.md](interface.md) |
| Design paper | 32 | 4 | 18 | 10 | [paper.md](paper.md) |

The same problem is often reported from both sides, so the real number of distinct problems is smaller than the sum (265). Each finding quotes both sides with file and line, says which should prevail and names the owner. Each file ends with the contracts the reviewer found to agree.

## Themes that cut across documents

1. **The same setting, ability or event under different names.** The members' area switch and name are `core.members-area.*` (identity, 40 characters) and `core.shells.members-area*` (interface, 30). The credit line and default colour mode are declared by both core and the interface. Default language has three homes. The fresh-sign-in window is `core.security.fresh-sign-in`, 15 minutes (foundations) and `core.sessions.reassert-window`, 10 minutes (identity, accepted as I12). The audit ability is `core.audit.view` or `core.audit.read`. `core.setting.change` is declared twice. The interface listens for `core.module.switched`, which foundations never announces (it announces `enabled` and `disabled`).
2. **Points defined twice or with different shapes.** `core.account-section` (identity and interface), `core.production-section` against `core.record-tab` (core against the interface and forms), and box office's checkout questions against forms' slot of nearly the same name. Several points are used but missing from foundations' index.
3. **Door and desk placement.** Box office puts the door in the console; the interface puts it in the Live shell at `/live`. Box office says the desk is phone first; the paper and interface say laptop first; the interface contradicts itself on whether the desk is console or Live.
4. **`side` value.** `members` in identity, the glossary and core's own scope note; `member` in core's data model, notification types and foundations' realm declaration.
5. **Account subjects without `unlinked`.** Nullable account columns in core and box office (including the anonymous desk sale) break foundations' rule, and identity records no ruling that allows them.
6. **Non-members at a members' address.** Identity's own rule promises a "this area is for members" page; Matt's decision and the interface say "page not found".
7. **Real logic faults in box office** (worth checking first): reserved orders' claims are already confirmed but the settle batch guards on held, so reservations paid at the desk would take the auto-refund path; the refund CHECK `approved_by <> requested_by` makes the self-approval limit impossible, and the counter trigger subtracts on declined refunds that never added; ticket and pass scan codes are stored in the clear where foundations says hashed; `payments_intents` still lists owner columns that moved to `payments_intent_parts`.
8. **Withdrawn or superseded items still live.** `box-office.eligibility`, `finance.income.recognise`, the "never both" email-subject rule, the old consent column, "Box office or Bar" either-or dependency in the module catalogue.
9. **Stale counts and statuses.** Box office overview says 37 tables, 59 stories, 9 questions (body: 38, 67, 11). Identity says 16 abilities in one place and 17 elsewhere (and 14 or 15 preset roles). Story totals differ (Foundations 35 or 36, Interface 34 or 36, backlog headline 265 against 533). The paper's proofs table and next-stage tab still say proofs are in progress; the proofs have passed.
10. **No owner for backups.** The paper, setup tab and identity all rely on a pre-migration and a nightly backup; foundations never mentions backups.
11. **Preset roles that do not exist.** Core and box office name "Programme manager" and "Theatre manager" as holders; foundations cites a "data-protection lead". Identity's fifteen presets include none of these.
12. **Part B of the paper is out of date against foundations**: one queue, sessions in KV, `site/` as a layer, previews on every branch, tests on any platform.

## Not covered

The second-round specifications (front of house, spaces, bar, training, membership, communications) are not in the repository, so only what foundations and the backlog say about them was checked.

## How these findings were produced

Reviewers read their own area in full and grepped or read the shared parts of the others. Each finding was meant to be checked twice against the files before being written. They are model-produced, so treat them as a prioritised worklist and verify before acting; spot checks of the abilities count, the members' area keys and the fresh-sign-in window all held up.
