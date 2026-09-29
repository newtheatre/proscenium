# Backlog index

318 stories across 11 modules. Detailed stories carry testable acceptance criteria; Later
entries are epic stubs awaiting their own definition pass. Story ids are stable once merged:
MVP stories number from x-101, V2 from x-201, Later from x-301. Cross-module dependencies are
named by module (or by the specification's story ids) until all files' numbering is final; the
first tracker import resolves them.

| File | Module | MVP | V2 | Later | Resolved | Total |
| --- | --- | --- | --- | --- | --- | --- |
| `A-identity.md` | Identity, membership and privacy | 33 | 4 | 2 | 2 | 41 |
| `B-productions.md` | Programming and productions (deferred) | 0 | 0 | 8 | 0 | 8 |
| `C-spaces.md` | Spaces and equipment | 24 | 6 | 2 | 0 | 32 |
| `D-ticketing.md` | Box office and ticketing | 32 | 7 | 2 | 1 | 42 |
| `E-show-night.md` | Show night operations | 31 | 4 | 1 | 0 | 36 |
| `F-bar.md` | Bar | 28 | 4 | 1 | 1 | 34 |
| `G-training.md` | Training and safety records | 27 | 12 | 2 | 3 | 44 |
| `H-communications.md` | Communications | 9 | 5 | 1 | 0 | 15 |
| `I-finance.md` | Finance | 9 | 3 | 1 | 0 | 13 |
| `J-governance.md` | Governance and handover | 10 | 6 | 0 | 1 | 17 |
| `K-platform.md` | Platform foundations and migration | 30 | 1 | 0 | 5 | 36 |
| **Total** | | **233** | **52** | **20** | **13** | **318** |

How the table counts: a story is a `## X-NNN:` heading in a module file, and its phase is the
first word of the `- Phase:` line beneath it, MVP, V2 or Later. The phase line decides, not the
id's range, because an id is stable once merged and a re-phased story keeps its own. A story
whose phase line begins `Resolved` (won't build, not needed, withdrawn, superseded, or satisfied
by procedure or a runbook) keeps its id and its resolution note, counts under Resolved rather
than under any phase, and still counts in the total. `bun run check docs` fails when a row, the
total row or the opening count disagrees with the files, naming the module and both figures,
and when a resolved story is not named below.

The resolved stories, excluded from the phase counts: A-106, A-202, D-205, F-201, G-127, K-115,
K-117 and K-118 were resolved as won't-build or not-needed on the 26 August spike outcomes and
committee amendments. G-124 and G-126 were built and then withdrawn on 2 September:
recalculation because a stamped expiry is now final (0041), and practice windows because
nothing ever read one (0042). J-108 was superseded on 30 August by 0030, which refuses the old
estate's audit history in any shape. K-116 was satisfied by procedure on 6 September: a
production export found no stock history to import, and the opening balance is a physical count
into F-115's stocktake screen. K-119 was resolved on 8 September: its rollback runbook in
`../operations.md` satisfies criterion 3, and its other criteria are acts on the old estate
rather than work in this repository.

Each file opens with its scope, its counts and its open questions; the open questions across
all files are the agenda feed for the workshops in `../workshops.md`. The MVP total, at the
compressed timeline's pace, means ruthless review at the gate: a story the committee cannot
defend cutting is in; anything argued about for more than five minutes moves
to V2 and the argument is recorded in its open questions.
