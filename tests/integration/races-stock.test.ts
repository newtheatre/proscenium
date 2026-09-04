import { describe, test } from 'bun:test'

// K-105 criterion 4: on-hand is always the sum of movements, and a sale's payment, lines and
// stock movements commit atomically. Split from races.test.ts so F-105 fills its own file.
describe('contended invariants (K-105)', () => {
  test.todo('a sale\'s payment, lines and stock movements commit atomically', () => {})
})
