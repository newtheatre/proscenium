import { describe, test } from 'bun:test'

// K-105 criterion 2: at most one confirmed duty manager per performance, and no shift claimable
// by two people, both held by unique constraints or atomic claim predicates.
describe('contended invariants (K-105)', () => {
  test.todo('a shift is claimable by exactly one person', () => {})

  test.todo('at most one confirmed duty manager per performance', () => {})
})
