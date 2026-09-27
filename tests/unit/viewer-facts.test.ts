import { describe, expect, test } from 'bun:test'
import { NO_SESSION_FACTS, sessionFacts, viewerFromSession } from '#shared/utils/viewer-facts'
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

const reads: string[] = []
Object.assign(globalThis, {
  liveGrants: async (id: string) => {
    reads.push(id)
    return id === 'u-committee' ? [{ role: 'BAR_MANAGER', expiresAt: null }] : []
  },
  longestTerm: async () => null,
  configValue: async () => 14,
  onShiftTonight: async () => false,
  keepsBarTab: async () => false,
  liveLeads: async () => [],
  trainerStandingOf: async () => ({ trainer: false, supervisor: false }),
  londonToday: () => '2026-09-27',
  permissionsFor: (grants: { role: string }[]) => new Set(grants.length ? ['night.till', 'bar.read'] : []),
})
// Loaded by a built path so the tests project does not type the file against Nitro's globals.
const { viewerFacts } = await import(['..', '..', 'server', 'utils', 'viewer-facts'].join('/')) as {
  viewerFacts: (event: unknown, accountId: string) => Promise<ViewerFacts>
}

describe('one set of viewer facts for the session and the ability resolver', () => {
  test('the session answers every fact the resolver holds, bar the id, which rides in user', () => {
    const { id: _, ...shared } = FACTS
    const answered = sessionFacts(FACTS)
    expect(answered).toMatchObject(shared)
    expect(Object.keys(answered).sort()).toEqual([...Object.keys(shared), 'canWorkTonight'].sort())
  })

  // The client's snapshot is typed from the session answer, so its signed-out defaults name every
  // fact, and the chrome's viewer is rebuilt from it with nothing lost or added.
  test('the chrome rebuilds the resolver\'s viewer from the session answer, fact for fact', () => {
    const { holdsRole: _, ...viewer } = FACTS
    expect(viewerFromSession(FACTS.id, sessionFacts(FACTS))).toEqual(viewer)
  })

  test('signed out, the snapshot holds every fact the session answers, each at its empty value', () => {
    expect(Object.keys(NO_SESSION_FACTS).sort()).toEqual(Object.keys(sessionFacts(FACTS)).sort())
    expect(NO_SESSION_FACTS).toMatchObject({ permissions: [], holdsRole: false, canWorkTonight: false, membershipState: { kind: 'none' } })
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

  test('each read is for the account it names, with its permissions sorted, and never lent to another', async () => {
    reads.length = 0
    const event = { context: {} }
    expect(await viewerFacts(event, 'u-committee')).toMatchObject({ id: 'u-committee', permissions: ['bar.read', 'night.till'], holdsRole: true })
    expect(await viewerFacts(event, 'u-member')).toMatchObject({ id: 'u-member', permissions: [], holdsRole: false })
    expect(reads).toEqual(['u-committee', 'u-member'])
  })
})
