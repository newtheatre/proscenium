// Shared set-up for the membership tests: the module on, the theatre's time zone set, the routes
// mounted, and helpers that make a scheme with its lengths.
import { expect } from 'vitest'
import { changeSetting, createUnit, fact, newId, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, server, setModule } from '../../../../tests/integration/helpers'
import schemesGet from '../../server/api/membership/schemes/index.get'
import schemesAll from '../../server/api/membership/schemes/all.get'
import schemesPost from '../../server/api/membership/schemes/index.post'
import schemeGet from '../../server/api/membership/schemes/[id].get'
import schemePatch from '../../server/api/membership/schemes/[id].patch'
import schemeDelete from '../../server/api/membership/schemes/[id].delete'
import statePost from '../../server/api/membership/schemes/[id]/state.post'
import optionsPost from '../../server/api/membership/schemes/[id]/options/index.post'
import optionPatch from '../../server/api/membership/schemes/[id]/options/[optionId].patch'
import membersPost from '../../server/api/membership/schemes/[id]/members.post'
import joinPost from '../../server/api/membership/schemes/[id]/join.post'
import mineGet from '../../server/api/membership/mine.get'

export const handle = server({
  'GET /api/membership/schemes': schemesGet,
  'GET /api/membership/schemes/all': schemesAll,
  'POST /api/membership/schemes': schemesPost,
  'GET /api/membership/schemes/:id': schemeGet,
  'PATCH /api/membership/schemes/:id': schemePatch,
  'DELETE /api/membership/schemes/:id': schemeDelete,
  'POST /api/membership/schemes/:id/state': statePost,
  'POST /api/membership/schemes/:id/options': optionsPost,
  'PATCH /api/membership/schemes/:id/options/:optionId': optionPatch,
  'POST /api/membership/schemes/:id/members': membersPost,
  'POST /api/membership/schemes/:id/join': joinPost,
  'GET /api/membership/mine': mineGet,
})

export const NOV_17 = Date.UTC(2026, 10, 17, 12)
export const officer = person(['membership.scheme.manage', 'membership.membership.add'], { reassertedAt: NOV_17 })

export async function req<T = any>(method: string, path: string, body?: unknown, actor: ReturnType<typeof person> | null = officer): Promise<{ status: number, body: T }> {
  const headers = method === 'POST' ? { 'idempotency-key': newId('req') } : {}
  const response = await call(handle, method, path, { actor: actor ?? undefined, body, headers })
  return { status: response.status, body: await response.json() as T }
}

let n = 0
export async function scheme(fields: Record<string, unknown> = {}, lengths: number[] = [12]): Promise<string> {
  n++
  const made = await req('POST', '/api/membership/schemes', { key: `scheme-${n}`, name: `Scheme ${n}`, side: 'members', lengthRule: 'rolling', ...fields })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  for (const count of lengths) expect((await req('POST', `/api/membership/schemes/${made.body.schemeId}/options`, { name: `${count} months`, count })).status).toBe(200)
  return made.body.schemeId
}

export const holds = (accountId: string, name: string) => inContext(() => fact(name, { kind: 'person', accountId } as any))

export async function ready(): Promise<void> {
  setClock(NOV_17)
  resetRateLimits()
  await setModule('membership', true)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    await unit.commit()
  })
}
