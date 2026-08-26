# Backlog index

256 stories across 11 modules. Detailed stories carry testable acceptance criteria; Later
entries are epic stubs awaiting their own definition pass. Story ids are stable once merged:
MVP stories number from x-101, V2 from x-201, Later from x-301. Cross-module dependencies are
named by module (or by the specification's story ids) until all files' numbering is final; the
first tracker import resolves them.

| File | Module | MVP | V2 | Later | Total |
| --- | --- | --- | --- | --- | --- |
| `A-identity.md` | Identity, membership and privacy | 25 | 4 | 2 | 33 |
| `B-productions.md` | Programming and productions (deferred) | 0 | 0 | 8 | 8 |
| `C-spaces.md` | Spaces and equipment | 18 | 6 | 2 | 26 |
| `D-ticketing.md` | Box office and ticketing | 29 | 5 | 2 | 37 |
| `E-show-night.md` | Show night operations | 27 | 4 | 1 | 32 |
| `F-bar.md` | Bar | 21 | 3 | 1 | 26 |
| `G-training.md` | Training and safety records | 26 | 8 | 2 | 37 |
| `H-communications.md` | Communications | 9 | 4 | 1 | 14 |
| `I-finance.md` | Finance | 9 | 3 | 1 | 13 |
| `J-governance.md` | Governance and handover | 10 | 3 | 0 | 13 |
| `K-platform.md` | Platform foundations and migration | 18 | 0 | 0 | 21 |
| **Total** | | **192** | **40** | **20** | **260** |

Eight stories (A-106, A-202, D-205, F-201, G-127, K-115, K-117, K-118) are resolved as
won't-build or not-needed on the 26 August spike outcomes and committee amendments; they keep
their ids and their resolution notes, and are excluded from the phase counts above.

Each file opens with its scope, its counts and its open questions; the open questions across
all files are the agenda feed for the workshops in `../workshops.md`. MVP totals 192 stories,
which at the compressed timeline's pace means ruthless review at the gate: a story the
committee cannot defend cutting is in; anything argued about for more than five minutes moves
to V2 and the argument is recorded in its open questions.
