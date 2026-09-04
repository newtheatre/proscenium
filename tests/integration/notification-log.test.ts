import { describe, test } from 'bun:test'

// 0048: a claim writes PENDING and notify() updates the same row, so a claimed send is one row.
// Seeded as test.todo ahead of the migration that adds PENDING to the status check (K-121).

describe('a claim is spoken for before it is sent (0048)', () => {
  test.todo('PENDING is a status the database accepts', () => {})
  test.todo('a claim already taken as PENDING refuses a second attempt at the same claim', () => {})
  test.todo('a PENDING row updates to its outcome without a second row appearing', () => {})
})

describe('server/utils/notify.ts, once claimNotification and notify() are updated (0048)', () => {
  test.todo('claimNotification writes PENDING, not SENT', () => {})
  test.todo('notify() updates the claimed row rather than inserting a second one', () => {})
  test.todo('a failed send on a claimed row leaves FAILED, never SENT beside it', () => {})
  test.todo('an unclaimed call to notify() still inserts a fresh row, exactly as today', () => {})
})
