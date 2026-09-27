import { describe, expect, test } from 'bun:test'
import { sessionFacts } from '#shared/utils/viewer-facts'
import type { ViewerFacts } from '#shared/utils/viewer-facts'

// The session and the ability resolver read one set of viewer facts, so a fact added to one can
// never be missing from the other (0009, 0094; the #1426 review).

const FACTS: ViewerFacts = {
  id: 'u-viewer',
  permissions: [],
  holdsRole: true,
  onShiftTonight: true,
  leadsDepartment: false,
  isTrainer: true,
  keepsBarTab: false,
  membershipState: { kind: 'current', until: '2027-07-31' },
}

describe('one set of viewer facts for the session and the ability resolver', () => {
  test('the session answers every fact the resolver holds, bar the id, which rides in user', () => {
    const { id: _, ...shared } = FACTS
    const answered = sessionFacts(FACTS)
    expect(answered).toMatchObject(shared)
    expect(Object.keys(answered).sort()).toEqual([...Object.keys(shared), 'canWorkTonight'].sort())
  })

  test('what follows from the facts is worked out from them', () => {
    expect(sessionFacts(FACTS).canWorkTonight).toBe(true)
    expect(sessionFacts({ ...FACTS, onShiftTonight: false }).canWorkTonight).toBe(false)
  })

  test('both resolvers read the facts through viewerFacts, and neither reads one for itself', async () => {
    const readers = ['liveGrants(', 'longestTerm(', 'onShiftTonight(event', 'keepsBarTab(event', 'liveLeads(', 'trainerStandingOf(', 'MEMBERSHIP_GRACE_DAYS']
    for (const file of ['server/api/auth/session.get.ts', 'server/plugins/authorisation.ts']) {
      const source = await Bun.file(file).text()
      expect(`${file}: ${source.includes('viewerFacts(event, account.id)')}`).toBe(`${file}: true`)
      expect(readers.filter(reader => source.includes(reader)).map(reader => `${file}: ${reader}`)).toEqual([])
    }
  })

  // An ability checked three times in one request asks for the viewer three times.
  test('the facts are read once per request, however often an ability asks', async () => {
    expect(await Bun.file('server/utils/viewer-facts.ts').text()).toContain('event.context.viewerFacts')
  })
})
