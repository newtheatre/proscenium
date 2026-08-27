# 0025: Configuration is a rule, not a record

- Status: Accepted
- Date: 2026-08-27

## Context

Decision 0012 says every operational rule with a number in it is a validated configuration key.
The Phase 0 register turned that into fifty keys. Building the settings surface put all fifty on a
screen, and three of them were plainly not settings.

- **`PASS_PRODUCTS`** was a list of objects: a name, a price in pence and a cap, per product. That
  is a catalogue of entities carrying money. Money is integer pence in an append-only ledger, and
  prices are dated and append-only with same-day correction (0004, F-116). A JSON blob in one row
  has no price history, no per-product audit and nothing to reference from a ticket.
- **`ROOM_OPENING_HOURS`** was a record keyed by room, each holding a list of day, opens and closes.
  That is a table in a blob: per-room data that belongs on the room, where a room can be renamed,
  archived or referenced.
- **`NOTIFICATION_TOPICS`** duplicated a CHECK constraint. `notification_preferences.topic` already
  restricts the five topics in the schema, so changing the key could only produce a topic the
  database refuses. The two had already drifted: the key shipped `bookings` and the constraint
  enforces `BOOKINGS`.

Two of those three were also the keys the register could propose no value for. That was the signal
and nobody read it: they had no proposed value because they are not the kind of thing a workshop
proposes a value for.

## Decision

A configuration key holds a **rule**: a number, a flag, a date boundary, or a list of scalars that
names a vocabulary. It never holds records. If a value has identity, history, or something that
refers to it, it is data and belongs in a table with a migration and an audit trail of its own.

The three keys are removed. Their subjects are not: the committee still decides the pass products
and the opening hours, through the screens that own them.

| Was | Now belongs to |
| --- | --- |
| `PASS_PRODUCTS` | D-123, season pass products, with dated prices |
| `ROOM_OPENING_HOURS` | C-101, room administration, per room |
| `NOTIFICATION_TOPICS` | the schema, which already constrains it |

`tests/unit/config.test.ts` fails if a key's default holds an object, so the same mistake cannot
arrive again through a key that ships one.

## Consequences

- The workshop register loses two rows it could not have answered usefully and gains two questions
  for the screens that will own them. Session 1 and session 2 change what they ask, not what they
  decide.
- `NIGHT_REPORT_RECIPIENTS` stays. It is a list of scalars and a standing distribution rule rather
  than a set of records, though it is the closest call of the fifty: if it ever needs to know which
  role a recipient holds, it becomes data and moves.
- The guard is on the default, so a key that ships unset could still smuggle an object in through
  its schema. Ships-unset keys are rare and reviewed; the test names that limit.
