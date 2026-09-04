import { describe, test } from 'bun:test'

// K-105 criterion 1: capacity is a database constraint or an atomic conditional write, never an
// application read-then-write. Split from races.test.ts so D-105 fills this on its own file.
describe('contended invariants (K-105)', () => {
  test.todo('the capacity race: concurrent claims on the last seat leave exactly one ticket', () => {})
})
