# Backlog index

264 stories across 11 modules. Detailed stories carry testable acceptance criteria; Later
entries are epic stubs awaiting their own definition pass. Story ids are stable once merged:
MVP stories number from x-101, V2 from x-201, Later from x-301. Cross-module dependencies are
named by module (or by the specification's story ids) until all files' numbering is final; the
first tracker import resolves them.

| File | Module | MVP | V2 | Later | Total |
| --- | --- | --- | --- | --- | --- |
| `A-identity.md` | Identity, membership and privacy | 26 | 4 | 2 | 34 |
| `B-productions.md` | Programming and productions (deferred) | 0 | 0 | 8 | 8 |
| `C-spaces.md` | Spaces and equipment | 24 | 6 | 2 | 32 |
| `D-ticketing.md` | Box office and ticketing | 30 | 5 | 2 | 38 |
| `E-show-night.md` | Show night operations | 27 | 4 | 1 | 32 |
| `F-bar.md` | Bar | 21 | 3 | 1 | 26 |
| `G-training.md` | Training and safety records | 25 | 11 | 2 | 41 |
| `H-communications.md` | Communications | 9 | 4 | 1 | 14 |
| `I-finance.md` | Finance | 9 | 3 | 1 | 13 |
| `J-governance.md` | Governance and handover | 9 | 3 | 0 | 13 |
| `K-platform.md` | Platform foundations and migration | 21 | 0 | 0 | 24 |
| **Total** | | **201** | **43** | **20** | **275** |

Eleven stories are resolved and excluded from the phase counts above, keeping their ids and
their resolution notes. Eight (A-106, A-202, D-205, F-201, G-127, K-115, K-117, K-118) were resolved as
won't-build or not-needed on the 26 August spike outcomes and committee amendments. Two more
(G-124, G-126) were built and then withdrawn on 2 September: recalculation because a stamped
expiry is now final (0041), and practice windows because nothing ever read one (0042). J-108 was
superseded on 30 August by 0030, which refuses the old estate's audit history in any shape.

Each file opens with its scope, its counts and its open questions; the open questions across
all files are the agenda feed for the workshops in `../workshops.md`. MVP totals 201 stories,
which at the compressed timeline's pace means ruthless review at the gate: a story the
committee cannot defend cutting is in; anything argued about for more than five minutes moves
to V2 and the argument is recorded in its open questions.
