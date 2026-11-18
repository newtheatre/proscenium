// The members' area for somebody who is not a member: a signed-in person whose membership has
// lapsed, or who never had one, is sent to My membership (which says when theirs ended and how to
// renew or join) rather than told the page does not exist. Signed out, they are asked to sign in.
import { beforeAll, describe, expect, it } from 'vitest'
import access from '../../../core/server/api/core/access.get'
import { call, person, server } from '../../../../tests/integration/helpers'
import { applicant, ready, req, scheme } from './stage'

beforeAll(ready)

const guard = server({ 'GET /api/core/access': access })
const decide = async (path: string, actor?: ReturnType<typeof person>) => (await (await call(guard, 'GET', `/api/core/access?path=${encodeURIComponent(path)}`, { actor })).json()) as { decision: string, to?: string }

describe("the members' area for somebody who is not a member", () => {
  it('sends a lapsed member and a non-member to My membership, and a member in', async () => {
    const id = await scheme({ side: 'members' })
    await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
    const lapsed = await req('POST', `/api/membership/schemes/${id}/members`, { address: 'lapsed-area@example.org', name: 'Priya Lapsed', startsOn: '2025-01-01', endsOn: '2025-12-31' })
    expect(lapsed.status, JSON.stringify(lapsed.body)).toBe(200)

    const priya = person([], { accountId: lapsed.body.accountId })
    expect(await decide('/members', priya)).toEqual({ decision: 'redirect', to: '/account/membership?from=members' })
    expect(await decide('/members', person([]))).toEqual({ decision: 'redirect', to: '/account/membership?from=members' })
    expect((await decide('/members')).decision).toBe('sign-in')

    const ada = await applicant('Ada Member')
    expect((await req('POST', `/api/membership/schemes/${id}/join`, {}, ada)).status).toBe(200)
    expect((await decide('/members', ada)).decision).toBe('allow')
  })
})
