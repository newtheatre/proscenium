import { describe, expect, test } from 'bun:test'

// D-117 criterion 6, 0115: approving a desk comp gives a seat away, so it asks for a credential
// proven within the window (A-128), once the approver's authority is settled and before the claim.

const ROUTE = 'server/api/box-office/desk/comp-requests/[id]/approve.post.ts'

describe('approving a desk comp needs a fresh credential (D-117 criterion 6, 0115)', () => {
  test('the route re-asserts after the authority check and before the decision', async () => {
    const route = await Bun.file(ROUTE).text()
    const authority = route.indexOf('isDutyManagerOrTicketingManager(')
    const fresh = route.indexOf('await requireFreshSession(event)')
    const decision = route.indexOf('decideTicketCompRequest(')

    expect(authority).toBeGreaterThan(-1)
    expect(fresh).toBeGreaterThan(authority)
    expect(decision).toBeGreaterThan(fresh)
  })
})
