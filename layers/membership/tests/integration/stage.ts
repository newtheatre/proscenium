// Shared set-up for the membership tests: the module on, the theatre's time zone set, the routes
// mounted, and helpers that make a scheme with its lengths.
import { expect } from 'vitest'
import { changeSetting, createUnit, fact, newId, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
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
import listsGet from '../../server/api/membership/lists/index.get'
import listsPost from '../../server/api/membership/lists/index.post'
import listGet from '../../server/api/membership/lists/[id].get'
import listPatch from '../../server/api/membership/lists/[id].patch'
import listDelete from '../../server/api/membership/lists/[id].delete'
import listImport from '../../server/api/membership/lists/[id]/import.post'
import entriesPost from '../../server/api/membership/lists/[id]/entries/index.post'
import entriesRemove from '../../server/api/membership/lists/[id]/entries/remove.post'
import listCheck from '../../server/api/membership/lists/[id]/check.post'
import applicationsGet from '../../server/api/membership/applications/index.get'
import decidePost from '../../server/api/membership/applications/[id]/decide.post'
import withdrawPost from '../../server/api/membership/mine/[id]/withdraw.post'
import mineEnd from '../../server/api/membership/mine/[id]/end.post'
import mineRenew from '../../server/api/membership/mine/[id]/renew.post'
import membersGet from '../../server/api/membership/members.get'
import membershipGet from '../../server/api/membership/memberships/[id].get'
import membershipEnd from '../../server/api/membership/memberships/[id]/end.post'
import schemesLookup from '../../server/api/membership/schemes/lookup.get'

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
  'GET /api/membership/lists': listsGet,
  'POST /api/membership/lists': listsPost,
  'GET /api/membership/lists/:id': listGet,
  'PATCH /api/membership/lists/:id': listPatch,
  'DELETE /api/membership/lists/:id': listDelete,
  'POST /api/membership/lists/:id/import': listImport,
  'POST /api/membership/lists/:id/entries': entriesPost,
  'POST /api/membership/lists/:id/entries/remove': entriesRemove,
  'POST /api/membership/lists/:id/check': listCheck,
  'GET /api/membership/applications': applicationsGet,
  'POST /api/membership/applications/:id/decide': decidePost,
  'POST /api/membership/mine/:id/withdraw': withdrawPost,
  'POST /api/membership/mine/:id/end': mineEnd,
  'POST /api/membership/mine/:id/renew': mineRenew,
  'GET /api/membership/members': membersGet,
  'GET /api/membership/memberships/:id': membershipGet,
  'POST /api/membership/memberships/:id/end': membershipEnd,
  'GET /api/membership/schemes/lookup': schemesLookup,
})

export const NOV_17 = Date.UTC(2026, 10, 17, 12)
export const officer = person(['membership.scheme.manage', 'membership.membership.add', 'membership.verification-list.manage', 'membership.membership.verify', 'membership.membership.end'], { reassertedAt: NOV_17 })

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

/** A signed-in person with a real account, and a verified address if given. */
export async function applicant(name: string, address?: string): Promise<ReturnType<typeof person>> {
  const who = person([], { name })
  await rows('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, ?, \'self\', ?, ?) RETURNING id', who.accountId, name, NOV_17, NOV_17)
  if (address) await rows('INSERT INTO core_account_emails (id, account_id, address, verified_at, added_by, created_at) VALUES (?, ?, ?, ?, \'self\', ?) RETURNING id', newId('aem'), who.accountId, address, NOV_17, NOV_17)
  return who
}
