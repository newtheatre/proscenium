# 0070: An imported role grant is a recorded human decision, never a mapped default

- Status: Accepted
- Date: 2026-09-14

## Context

The identity transform mapped every live old grant through `migration/role-map.json` and wrote
the result. The map was marked provisional, and 0009 says operational authority derives from
facts rather than standing grants, but the import was the one place a standing grant appeared in
the unified system without anybody having decided it should. The fresh export of 13 September
2026 made the cost concrete: 39 grants across 18 holders, all permanent, three namespaces'
`ADMIN` collapsing onto one unified `ADMIN` for ten people, several on external addresses, one on
a disabled account. Mapping those silently would have handed out the most privileged role in the
system to whoever the old ticketing app once trusted with its own.

## Decision

**Every live old grant crosses only because a person decided it should, and the decision is
recorded.** `migration/review-roles.ts` walks the live grants holder by holder, shows what the
old estate knew about each (name, address, sign-in methods, verified, disabled, every role held)
and the map's suggestion, and offers four answers: accept with the committee-year expiry, accept
as permanent, change the role, or skip. A disabled or anonymised holder defaults to skip. Each
answer is written to `out/role-decisions.tsv` as it is given, so an interrupted review resumes
where it stopped and a rerun never asks twice.

The identity transform consumes decisions, not the map. A live grant with no decision is an
exception, is not imported, and fails the reconciliation, so a build cannot quietly proceed with
undecided authority. `role-map.json` survives only as the source of the suggestion the prompt
shows.

The default expiry offered is the next 31 July (`nextCommitteeYearEnd`), the same expiry a grant
made today gets (0009). Permanent is a deliberate choice at the prompt, never the default the old
estate happened to carry.

## Consequences

- `out/role-decisions.tsv` is a working artefact like `id-map.tsv`: gitignored, kept with the
  archive, and the answer to "who decided this grant" for the imported ones.
- The synthetic dry run and the tests build decisions with `decideByMap()`, which accepts every
  grant the map covers; that helper exists for fixtures and is not used by the real run.
- K-112 criterion 2 is amended: the "written vocabulary table" is the suggestion, the decisions
  file is the record.
- A rehearsal build needs a decisions file. Whoever runs one without the real review writes a
  rehearsal file and deletes it before the review that counts.
