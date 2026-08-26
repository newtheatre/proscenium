import { describe, test } from 'bun:test'

// Named regression cases (K-121). Erasure is anonymisation in one transaction (0011).
describe('erasure (K-109, 0011)', () => {
  test.todo('erasure completeness: no personal value survives anywhere the export reaches', () => {})
  test.todo('an anonymised row is never written back over', () => {})
  test.todo('booking and sales statistics survive an erasure', () => {})
  test.todo('the erasure hook is idempotent under retry', () => {})
})
