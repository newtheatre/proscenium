# 0035: A multi-row claim asserts its own completeness

- Status: Accepted
- Date: 2026-09-01

## Context

A recurring series is one action that claims many slots (C-110 criterion 3): either every
occurrence is written or none is, and a member must never end up with eight of their twelve weeks.

Every contended claim in this system rides its predicate on the write (0003, 0006):

```sql
INSERT INTO room_bookings (...) SELECT ... WHERE NOT EXISTS (<clash>)
```

That shape works because a single claim can read its own outcome: `RETURNING id` gives a row when
it won and nothing when it lost, and the route answers accordingly.

It stops working the moment one action needs several of them. D1 has no interactive transaction;
atomicity is `db.batch` and nothing else (0001, 0003). A batch is all-or-nothing only for
*failures*: every statement runs, or none does, if one raises. A guarded `INSERT` that matches no
rows does not raise. It writes nothing and reports success. So a batch of twelve guarded claims
where the fifth was beaten to its slot commits eleven bookings and a series row describing twelve,
silently, with no error anywhere.

Checking before writing does not fix it either. The check is a separate statement from the batch,
so anything can claim a slot in between, and that gap is exactly what the predicate-on-the-write
pattern exists to close.

## Decision

**A batch that claims several rows ends with a statement that fails the batch unless every claim
landed.** The assertion re-inserts the parent row, whose primary key the batch has already taken,
guarded on a count:

```sql
INSERT INTO room_series (id, ...)
SELECT <the same id>, ...
WHERE (SELECT count(*) FROM room_bookings WHERE series_id = <id>) <> <expected>
```

When every claim landed, the count matches, the `WHERE` is false, no row is inserted and nothing
happens. When one was beaten, the count is short, the statement inserts a duplicate primary key,
the constraint raises, and the batch rolls back: no bookings, no series, nothing.

The parent row is inserted **first**, so the child rows referencing it never violate their foreign
key on the way in.

## Consequences

- The all-or-nothing guarantee is the database's, not the handler's. No compensating delete runs
  afterwards, and no partial state exists for a crash to leave behind.
- The failure surfaces as a thrown constraint error rather than a returned outcome, so a caller
  distinguishes "beaten to a slot" from anything else by catching it, and answers 409.
- It is deliberately odd, which is why it is written down. A reader meeting the assertion for the
  first time would otherwise take it for a copy-paste mistake and delete it.
- It applies to any future action claiming several contended rows at once: a bumped series
  (C-115), a blackout cancelling and rebooking (C-114). The shape is the same each time.
- The cost is one extra statement per batch and one extra bound parameter set. Nothing reads it.

## Alternatives rejected

**Check every occurrence, then write them unguarded.** Loses the race the whole booking module is
built to win; two members creating overlapping series in the same second would both succeed.

**Write, count, and delete on a short count.** A compensating action rather than atomicity: if the
delete fails or the isolate dies between the two, the partial series is what remains, and the case
that leaves it behind is the one nobody tests.

**A trigger raising on an incomplete series.** A trigger cannot see the intended count, which is
the caller's, not the row's. Passing it in would mean a column existing only to be asserted on.

**Serialise series creation behind a lock.** There is nowhere to put one. A Durable Object per
room would do it and is a large amount of machinery for a case an assertion already covers.
