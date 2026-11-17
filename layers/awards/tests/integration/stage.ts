// Shared set-up for the awards tests: the module on, the routes mounted, and helpers that make an
// award type and a person with a real account.
import { expect } from 'vitest'
import { changeSetting, createUnit, fact, newId, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import typesGet from '../../server/api/awards/types/index.get'
import typesPost from '../../server/api/awards/types/index.post'
import typeGet from '../../server/api/awards/types/[id].get'
import typePatch from '../../server/api/awards/types/[id].patch'
import typeDelete from '../../server/api/awards/types/[id].delete'
import issuePost from '../../server/api/awards/types/[id]/awards.post'
import awardsGet from '../../server/api/awards/awards/index.get'
import awardGet from '../../server/api/awards/awards/[id].get'
import awardPatch from '../../server/api/awards/awards/[id].patch'
import revokePost from '../../server/api/awards/awards/[id]/revoke.post'
import accountAwards from '../../server/api/awards/accounts/[id]/awards.get'
import mineGet from '../../server/api/awards/mine.get'
import visibilityPost from '../../server/api/awards/mine/[id]/visibility.post'

export const handle = server({
  'GET /api/awards/types': typesGet,
  'POST /api/awards/types': typesPost,
  'GET /api/awards/types/:id': typeGet,
  'PATCH /api/awards/types/:id': typePatch,
  'DELETE /api/awards/types/:id': typeDelete,
  'POST /api/awards/types/:id/awards': issuePost,
  'GET /api/awards/awards': awardsGet,
  'GET /api/awards/awards/:id': awardGet,
  'PATCH /api/awards/awards/:id': awardPatch,
  'POST /api/awards/awards/:id/revoke': revokePost,
  'GET /api/awards/accounts/:id/awards': accountAwards,
  'GET /api/awards/mine': mineGet,
  'POST /api/awards/mine/:id/visibility': visibilityPost,
})

export const NOV_17 = Date.UTC(2026, 10, 17, 12)
export const secretary = person(['awards.type.view', 'awards.type.manage', 'awards.award.view', 'awards.award.issue', 'awards.award.update', 'awards.award.revoke'], { reassertedAt: NOV_17 })

export async function req<T = any>(method: string, path: string, body?: unknown, actor: ReturnType<typeof person> | null = secretary): Promise<{ status: number, body: T }> {
  const headers = method === 'POST' ? { 'idempotency-key': newId('req') } : {}
  const response = await call(handle, method, path, { actor: actor ?? undefined, body, headers })
  return { status: response.status, body: await response.json() as T }
}

let n = 0
export async function awardType(fields: Record<string, unknown> = {}): Promise<string> {
  n++
  const made = await req('POST', '/api/awards/types', { key: `award-${n}`, name: `Award ${n}`, ...fields })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body.typeId
}

/** A signed-in person with a real account. */
export async function holder(name: string): Promise<ReturnType<typeof person>> {
  const who = person([], { name })
  await rows('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, ?, \'self\', ?, ?) RETURNING id', who.accountId, name, NOV_17, NOV_17)
  return who
}

export async function issue(typeId: string, body: Record<string, unknown>): Promise<string> {
  const made = await req('POST', `/api/awards/types/${typeId}/awards`, { awardedOn: '2026-11-17', ...body })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body.awardId
}

export const holds = (accountId: string, typeId: string) => inContext(() => fact('awards.type-holder', { kind: 'person', accountId } as any, ['awards.type', typeId]))

export async function ready(): Promise<void> {
  setClock(NOV_17)
  resetRateLimits()
  await setModule('awards', true)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    await unit.commit()
  })
}
