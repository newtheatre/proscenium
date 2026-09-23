# Backlog index

305 stories across 11 modules. Detailed stories carry testable acceptance criteria; Later
entries are epic stubs awaiting their own definition pass. Story ids are stable once merged:
MVP stories number from x-101, V2 from x-201, Later from x-301. Cross-module dependencies are
named by module (or by the specification's story ids) until all files' numbering is final; the
first tracker import resolves them.

| File | Module | MVP | V2 | Later | Total |
| --- | --- | --- | --- | --- | --- |
| `A-identity.md` | Identity, membership and privacy | 28 | 4 | 2 | 36 |
| `B-productions.md` | Programming and productions (deferred) | 0 | 0 | 8 | 8 |
| `C-spaces.md` | Spaces and equipment | 24 | 6 | 2 | 32 |
| `D-ticketing.md` | Box office and ticketing | 32 | 5 | 2 | 40 |
| `E-show-night.md` | Show night operations | 31 | 4 | 1 | 36 |
| `F-bar.md` | Bar | 28 | 3 | 1 | 33 |
| `G-training.md` | Training and safety records | 26 | 11 | 2 | 42 |
| `H-communications.md` | Communications | 9 | 5 | 1 | 15 |
| `I-finance.md` | Finance | 9 | 3 | 1 | 13 |
| `J-governance.md` | Governance and handover | 10 | 6 | 0 | 17 |
| `K-platform.md` | Platform foundations and migration | 29 | 1 | 0 | 33 |
| **Total** | | **226** | **48** | **20** | **305** |

The show night row also took a correction when E-130 and E-131 were added: E-128 and E-129 had
reached their file without this table following, so its MVP count moved by four rather than two.

Eleven stories are resolved and excluded from the phase counts above, keeping their ids and
their resolution notes. Eight (A-106, A-202, D-205, F-201, G-127, K-115, K-117, K-118) were resolved as
won't-build or not-needed on the 26 August spike outcomes and committee amendments. Two more
(G-124, G-126) were built and then withdrawn on 2 September: recalculation because a stamped
expiry is now final (0041), and practice windows because nothing ever read one (0042). J-108 was
superseded on 30 August by 0030, which refuses the old estate's audit history in any shape.

Each file opens with its scope, its counts and its open questions; the open questions across
all files are the agenda feed for the workshops in `../workshops.md`. MVP totals 224 stories,
which at the compressed timeline's pace means ruthless review at the gate: a story the
committee cannot defend cutting is in; anything argued about for more than five minutes moves
to V2 and the argument is recorded in its open questions.
