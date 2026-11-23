// An ability that needs a strong sign-in refuses a basic one, and says which of two things stands in
// the way: a passkey the person has and did not use, or two-step sign-in they have not set up. A
// route that makes its own check and answers "no permission" answers the same when that was why.
import { afterEach, describe, expect, it } from 'vitest'
import { can, setAccessProvider, STRONGER_SIGN_IN } from '#kit/access'
import { defineRoute } from '#kit/route'
import { refuse } from '#kit/refusal'
import { call, inContext, person, server, testAccess } from './helpers'

const PRIVILEGED = 'core.modules.manage'
const basic = () => person([PRIVILEGED, 'core.health.view'], { assurance: 'basic' })

const ownCheck = defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  if (!(await can(actor, PRIVILEGED)).allowed) refuse('core.access.denied', 'You do not have permission to do this.', { status: 403 })
  return { ok: true }
})
const plainDenial = defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async () => {
  refuse('core.access.denied', 'This is not yours.', { status: 403 })
})
const handle = server({ 'GET /api/core/two-step-own-check': ownCheck, 'GET /api/core/two-step-plain-denial': plainDenial })

afterEach(() => setAccessProvider(testAccess))

describe('a basic sign-in on an ability that needs a strong one', () => {
  it('is told to set up two-step sign-in when the account has no way to sign in strongly', async () => {
    setAccessProvider({ ...testAccess, strongSetUp: async () => false })
    const actor = basic()
    const decision = await inContext(() => can(actor, PRIVILEGED), actor)
    expect(decision).toMatchObject({ allowed: false, code: 'core.access.two-step-not-set-up', status: 403, reason: 'This needs two-step sign-in.' })
    expect(STRONGER_SIGN_IN).toContain('core.access.two-step-not-set-up')
  })

  it('is asked for the stronger sign-in when the account has one', async () => {
    setAccessProvider({ ...testAccess, strongSetUp: async () => true })
    const actor = basic()
    expect(await inContext(() => can(actor, PRIVILEGED), actor)).toMatchObject({ allowed: false, code: 'core.access.needs-strong-sign-in', status: 403 })
  })

  it('is asked for the stronger sign-in when nothing says whether one is set up', async () => {
    const actor = basic()
    expect(await inContext(() => can(actor, PRIVILEGED), actor)).toMatchObject({ allowed: false, code: 'core.access.needs-strong-sign-in' })
  })

  it('is refused as having no permission when the ability is not held at all', async () => {
    setAccessProvider({ ...testAccess, strongSetUp: async () => false })
    const actor = person([], { assurance: 'basic' })
    expect(await inContext(() => can(actor, PRIVILEGED), actor)).toMatchObject({ allowed: false, code: 'core.access.denied' })
  })
})

describe('a route that makes its own check', () => {
  it('answers that two-step sign-in is needed, not "no permission", when the sign-in was what stood in the way', async () => {
    setAccessProvider({ ...testAccess, strongSetUp: async () => false })
    const response = await call(handle, 'GET', '/api/core/two-step-own-check', { actor: basic() })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'core.access.two-step-not-set-up', reason: 'This needs two-step sign-in.' })
  })

  it('still answers "no permission" to someone who does not hold the ability', async () => {
    setAccessProvider({ ...testAccess, strongSetUp: async () => false })
    const response = await call(handle, 'GET', '/api/core/two-step-own-check', { actor: person([], { assurance: 'basic' }) })
    expect(await response.json()).toMatchObject({ code: 'core.access.denied' })
  })

  it('keeps a refusal that no check of the sign-in came before', async () => {
    const response = await call(handle, 'GET', '/api/core/two-step-plain-denial', { actor: basic() })
    expect(await response.json()).toMatchObject({ code: 'core.access.denied', reason: 'This is not yours.' })
  })
})
