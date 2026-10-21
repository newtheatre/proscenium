import { describe, expect, test } from 'bun:test'

// A privileged role with no authenticator is refused everywhere until one is set up (A-112), so
// the refusal has to name the way through, once, and the grant has to say it waits on one.
const read = (path: string): Promise<string> => Bun.file(path).text()

describe('the overview says the authenticator wall once, with the way through', () => {
  test('every card\'s read is a failure that carries the enrolment path', async () => {
    const source = await read('app/pages/admin/index.vue')
    for (const error of ['overviewError', 'drillError', 'troubleError']) {
      expect(source).toContain(`useListFailure(${error}`)
    }
    expect(source).not.toMatch(/refusalText\((overview|drill|trouble)Error/)
  })

  test('one banner holds the wall, and no card repeats it', async () => {
    const source = await read('app/pages/admin/index.vue')
    expect(source).toContain('data-test="authenticator-wall"')
    expect(source).toContain('.find(failure => failure?.enrolPath)')
    for (const card of ['drillOwn', 'overviewOwn', 'troubleOwn', 'waitingOwn']) {
      expect(source).toContain(card)
    }
  })

  test('a count that did not arrive is asked again here, not on another screen', async () => {
    const source = await read('app/pages/admin/index.vue')
    expect(source).not.toContain('Open another screen')
    expect(source).toContain('@retry="refreshWaiting"')
    const counts = await read('app/composables/useNavCounts.ts')
    expect(counts).toContain('failure.value = listFailureFrom(')
  })
})

describe('a grant that waits on an authenticator says so', () => {
  test('the route answers whether the role does anything for them yet', async () => {
    const source = await read('server/api/admin/roles/index.post.ts')
    expect(source).toContain('waitsOnFactor')
    expect(source).toContain('PRIVILEGED_ROLES')
    expect(source).toContain('confirmedFactor(')
  })

  test('the grant form tells the granter, naming where the holder sets one up', async () => {
    const source = await read('app/components/RoleGrantForm.vue')
    expect(source).toContain('data-test="grant-waits-on-factor"')
    expect(source).toContain('Sign-in and security')
  })
})
