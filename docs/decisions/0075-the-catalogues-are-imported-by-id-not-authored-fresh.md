# 0075: The catalogues are imported from the old estate by id, not authored fresh

- Status: Accepted
- Date: 2026-09-14

## Context

Three transforms could not run until somebody had authored their catalogue through an admin
screen: bookings needed rooms and union venues, training needed departments and modules,
reservations needed ticket types. 0065 said the training catalogue "is authored fresh, not
migrated"; the reservations story said the same of ticket types; `generate-reference-maps.ts`
then drafted a name match from each old row to whatever had been authored, left blanks where
the names differed, and the consuming transform refused to run until a person confirmed every
line. The reasoning was sound when written: the unified tables carry fields the old ones lack,
and a catalogue is committee-owned configuration rather than history.

On the night the database was reset (13 September 2026) the live `unified` held no rooms, no
venues, no departments, no modules and no ticket types. Every one of them existed in the old
estate: 4 rooms and 27 union venues in `rooms`, 9 departments, 57 modules and 67 prerequisites
in `training`, 23 ticket types in `proscenium`. Authoring them by hand meant retyping 120 rows
that were already correct, then confirming a map against the retyped names, on the one evening
nobody had time to spare. The direction was that no avoidable manual step survives.

## Decision

**The catalogues import from the old estate by id, in one transform (`migration/catalogue.ts`),
before any history that keys to them.** Rooms and union venues come from `rooms`, departments,
modules and prerequisites from `training`, ticket types from `proscenium`. Each row keeps its
old identity through a minted map (`out/room-id-map.tsv`, `space-id-map.tsv`,
`ticket-type-id-map.tsv`; modules and departments keep their published codes as ids), so a rerun
updates rather than duplicates, exactly as every other transform already does. The reference-map
mechanism (`reference-map.ts`, `generate-reference-maps.ts`, the "Two kinds of map" section) is
removed: there is no longer a row a transform does not create.

Fields the old estate never held take the unified default and nothing else: a module's delivery
mode is `IN_PERSON`, `self_registrable` is false, a ticket type's `restricted_to` is null. A row
the unified CHECKs would refuse (a brief with an expiry, a months policy with no months) is
written with the policy it can hold and named in the exceptions, never dropped.

**Only a ticket somebody buys is a ticket type.** The old `PASS_SALE` and `PASS_ADMISSION` types
are not imported: a pass sale becomes a pass (0073) and every pass admission lands on the one
system-owned row (0074), which this transform mints so it exists from the first day.

## Consequences

- 0065's "the catalogue is not imported" paragraph is superseded by this record; the rest of
  0065 stands. D-119's assumption that ticket types are authored fresh is amended in the backlog.
- The committee still owns these tables after cutover through the same admin screens; the import
  gives them a starting point that is the old estate's truth rather than a blank list.
- `transform-training.ts` keeps its refusal to run against a target with no catalogue. In a
  `build.ts` run it is unreachable; standalone it is still the right refusal.
- The synthetic dry run and the integration suites build their own catalogue fixtures, so the
  tests that proved the old order still prove the new one.
