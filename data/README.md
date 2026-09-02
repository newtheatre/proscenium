# Catalogue data

## `catalogue.csv` is the subcommittee's draft catalogue

From *NNT Training Module Catalogue, Complete Draft* (10 August 2026): 57 modules across the nine
departments, including the eight certifications. It is the same file the training app carries, so
the two describe the same catalogue.

**This is development data only.** The real departments and modules are migrated from the old
database at cutover; nothing here is a source of truth for production, and there is no production
loader. `bun run seed` reads it so a development database looks like the theatre rather than like
three modules somebody invented.

**Every row is `DRAFT`**, as the source document has them, so a seeded database shows members
nothing until somebody publishes a module. That is faithful to the draft, which is explicitly for
subcommittee review with its open decisions listed at the end.

Faithful to the document, deliberately:

- `Safety Critical` is set only on the six rows the draft marks (`SFTY-012`, `SFTY-021`,
  `SFTY-022`, `TECH-201`, `STGE-201`, `MGMT-201`). The flag hard-blocks a session when a
  prerequisite is missing, so it is not somewhere to be generous.
- `SFTY-012` is **not** a prerequisite of `TECH-111`: the draft flags that as a subcommittee call,
  so it stays unmade here.
- The 13 TECH modules carry no `Description`: the draft says their text is unchanged in the
  subcommittee's own spreadsheet and does not reproduce it. Their notes say so. Everything else
  carries the draft's own wording.
- **No row carries a `Materials Link`.** The draft names no Drive documents, so the seed creates no
  material rows. The column is read and loaded, so filling it in is all that is needed.
- The draft's open questions (new modules to confirm, `AV-CERT` and `SM-CERT` naming, `LEAD-CERT`
  expiry, COST and PROD sign-off leads) are in each module's `Notes`, which only leads and
  administrators see.

The nine department codes and names live in `scripts/lib/catalogue.ts` rather than in the CSV: they
are the `DEPT` half of the `DEPT-LCT` id scheme, and the spreadsheet names them by code alone.

## Format

One row per module or certification, with a leading `Department` column.

| Column | Required | Notes |
| --- | --- | --- |
| `Department` | yes | Department code. For a certification this is the department it belongs to (`LD-CERT` is `TECH`); for a module it must match the id prefix. |
| `ID` | yes | `DEPT-LCT` (`TECH-111`) or `XX-CERT` (`LD-CERT`). |
| `Name` | yes | Member-visible. |
| `Description` | | Member-visible, and what the catalogue shows somebody deciding whether to take it. |
| `Prerequisites` | | Comma-separated ids; each must resolve within the file. |
| `Old Module(s)` | | Read and discarded: the live schema carries no legacy-id columns (0015). |
| `Proposed Expiry` | | `Never`, `Academic year`, `N months`, `N years`, `External cert date`, `Brief (recurring)`. Blank is Never. |
| `Materials Link` | | Must be `https://`. Becomes one row in `module_materials`. |
| `Safety Critical` | | `yes` or `no`. |
| `Grants` | | `supervisor`, `trainer`, or both. Certifications only. |
| `Status` | | `DRAFT` (default), `ACTIVE`, `RETIRED`. |
| `Notes` | | Lead and administrator visible only. |

Unknown columns are ignored, so the subcommittee can keep their own working columns.
**An unparseable cell is a hard failure naming the cell**: nothing is skipped silently.

`kind` is derived rather than typed: an id ending `-CERT` is a `CERTIFICATION` and signs off, a
`Brief (recurring)` expiry makes a `BRIEF`, and everything else is a `MODULE`. `tests/unit/catalogue.test.ts`
pins those rules.

Re-run after editing with `bun run seed`. Both the modules and the departments are upserted by id,
so a re-run updates rather than duplicates, and nothing is ever deleted: records reference modules.
