import { describe, test } from 'bun:test'

// Named regression cases (K-121). Every claim below is proven by a test that fires concurrent
// requests and asserts one winner, never by a comment (K-105, 0006).
describe('contended invariants (K-105)', () => {
  test.todo('the capacity race: concurrent claims on the last seat leave exactly one ticket')
  test.todo('the register race: two submissions of one register produce exactly one set of awards')
  test.todo('a shift is claimable by exactly one person')
  test.todo('at most one confirmed duty manager per performance')
  test.todo('a promotion notification is sent at most once')
  test.todo('a sale\'s payment, lines and stock movements commit atomically')
})
