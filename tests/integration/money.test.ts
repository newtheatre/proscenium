import { describe, test } from 'bun:test'

// Named regression cases (K-121). Money is integer pence throughout (0004).
describe('the ledger (0004, 0005)', () => {
  test.todo('the double refund: refunding twice posts one reversal, not two')
  test.todo('the expected-total mismatch: a quote that disagrees with the server refuses, quoting both')
  test.todo('every monetary fact posts to the ledger in the same batch as its domain write')
})
