# 0024: A settings change records a hash where its value could identify someone

- Status: Accepted
- Date: 2026-08-27

## Context

J-104 criterion 5 asks that every configuration change write an audit entry with the from and to
values. Decision 0011 requires that audit detail never carry personal data, and
`shared/utils/audit.ts` enforces that: it refuses anything address-shaped at any depth, any string
over 120 characters, and any key whose name is prose by definition.

The two collide in the configuration surface. `NIGHT_REPORT_RECIPIENTS` is
`z.array(z.string().email())`, so recording its from and to would put addresses in an append-only
table that erasure is built never to have to reach. Worse, the guard throws rather than returns, so
a caller that hands it an unacceptable value turns a settings change into a 500. That failure would
have been discovered by a committee officer editing the recipients list, not by a test.

## Decision

A key whose value can carry personal data is marked `sensitive` in its definition. A change to one
records the key, that it changed, and a truncated SHA-256 of the value on each side. Every other
key records its real from and to.

The same fallback applies automatically to any value the guard would refuse, whether or not its key
is marked. A key added later cannot make a settings change fail, and a schema widened later cannot
quietly start writing addresses to the log.

Where the two rules conflict, 0011 wins. The audit trail says which setting moved, when, and by
whom, and lets a later reader prove which value it held by hashing a candidate. It does not hold
the value itself.

## Consequences

- Criterion 5 is met in full for every key but the sensitive ones, and in part for those: the
  change is recorded and provable, the value is not readable from the log.
- The current value and its last editor live in the `config` table, which is not append-only and
  which erasure can reach through `updated_by`. Reconstructing a bad change means the audit trail
  plus the table, not the trail alone.
- A hash is only as useful as the guesses made against it. For a recipients list that is enough to
  confirm or refute a specific candidate, which is the question actually asked after a mistake.
- Marking a key sensitive is a code change, deliberately: it is a judgement about what a value can
  contain, not an operational number.
