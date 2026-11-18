// Shared set-up for the forms tests: the routes mounted, an author, and a helper that starts a form.
import { expect } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import formsGet from '../../server/api/forms/forms/index.get'
import formsPost from '../../server/api/forms/forms/index.post'
import formGet from '../../server/api/forms/forms/[id].get'
import formPatch from '../../server/api/forms/forms/[id].patch'
import draftPut from '../../server/api/forms/forms/[id]/draft.put'
import publishGet from '../../server/api/forms/forms/[id]/publish.get'
import publishPost from '../../server/api/forms/forms/[id]/publish.post'
import exportGet from '../../server/api/forms/forms/[id]/export.get'
import linkGet from '../../server/api/forms/forms/[id]/link.get'
import linkPut from '../../server/api/forms/forms/[id]/link.put'
import openGet from '../../server/api/forms/open/[slug].get'
import openDraftPut from '../../server/api/forms/open/[slug]/draft.put'
import openSendPost from '../../server/api/forms/open/[slug]/responses.post'
import responsesGet from '../../server/api/forms/forms/[id]/responses/index.get'
import responseGet from '../../server/api/forms/forms/[id]/responses/[response].get'
import responsesExport from '../../server/api/forms/forms/[id]/responses/export.get'
import mineGet from '../../server/api/forms/mine/index.get'
import mineOneGet from '../../server/api/forms/mine/[id].get'
import mineOnePut from '../../server/api/forms/mine/[id].put'
import movePost from '../../server/api/forms/forms/[id]/responses/[response]/move.post'
import moveManyPost from '../../server/api/forms/forms/[id]/responses/move.post'
import releasePost from '../../server/api/forms/forms/[id]/responses/[response]/release.post'
import reviewsGet from '../../server/api/forms/reviews/index.get'
import reviewGet from '../../server/api/forms/reviews/[id].get'
import reviewPut from '../../server/api/forms/reviews/[id].put'
import conflictPost from '../../server/api/forms/reviews/[id]/conflict.post'
import sourceGet from '../../server/api/forms/sources/[source].get'
import slotGet from '../../server/api/forms/slots/[slot]/[subject]/index.get'
import slotPut from '../../server/api/forms/slots/[slot]/[subject]/[form].put'
import slotDelete from '../../server/api/forms/slots/[slot]/[subject]/[form].delete'
import statusPost from '../../server/api/forms/forms/[id]/status.post'
import runPost from '../../server/api/forms/forms/[id]/responses/[response]/actions/[run]/run.post'
import type { Definition, Question } from '../../shared/engine'

export const handle = server({
  'GET /api/forms/forms': formsGet,
  'POST /api/forms/forms': formsPost,
  'GET /api/forms/forms/:id': formGet,
  'PATCH /api/forms/forms/:id': formPatch,
  'PUT /api/forms/forms/:id/draft': draftPut,
  'GET /api/forms/forms/:id/publish': publishGet,
  'POST /api/forms/forms/:id/publish': publishPost,
  'GET /api/forms/forms/:id/export': exportGet,
  'GET /api/forms/forms/:id/link': linkGet,
  'PUT /api/forms/forms/:id/link': linkPut,
  'GET /api/forms/open/:slug': openGet,
  'PUT /api/forms/open/:slug/draft': openDraftPut,
  'POST /api/forms/open/:slug/responses': openSendPost,
  'GET /api/forms/forms/:id/responses': responsesGet,
  'GET /api/forms/forms/:id/responses/export': responsesExport,
  'GET /api/forms/forms/:id/responses/:response': responseGet,
  'GET /api/forms/mine': mineGet,
  'GET /api/forms/mine/:id': mineOneGet,
  'PUT /api/forms/mine/:id': mineOnePut,
  'POST /api/forms/forms/:id/responses/move': moveManyPost,
  'POST /api/forms/forms/:id/responses/:response/move': movePost,
  'POST /api/forms/forms/:id/responses/:response/release': releasePost,
  'GET /api/forms/sources/:source': sourceGet,
  'POST /api/forms/forms/:id/status': statusPost,
  'GET /api/forms/slots/:slot/:subject': slotGet,
  'PUT /api/forms/slots/:slot/:subject/:form': slotPut,
  'DELETE /api/forms/slots/:slot/:subject/:form': slotDelete,
  'POST /api/forms/forms/:id/responses/:response/actions/:run/run': runPost,
  'GET /api/forms/reviews': reviewsGet,
  'GET /api/forms/reviews/:id': reviewGet,
  'PUT /api/forms/reviews/:id': reviewPut,
  'POST /api/forms/reviews/:id/conflict': conflictPost,
})

export const NOV_17 = Date.UTC(2026, 10, 17, 12)
export const author = person(['forms.form.create', 'forms.form.edit', 'forms.form.publish'], { name: 'Ada Author', reassertedAt: NOV_17 })

export async function req<T = any>(method: string, path: string, body?: unknown, actor: ReturnType<typeof person> | null = author): Promise<{ status: number, body: T }> {
  const headers = method === 'POST' ? { 'idempotency-key': newId('req') } : {}
  const response = await call(handle, method, path, { actor: actor ?? undefined, body, headers })
  return { status: response.status, body: await response.json() as T }
}

export async function account(who: ReturnType<typeof person>): Promise<void> {
  await rows('INSERT OR IGNORE INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, ?, \'self\', ?, ?) RETURNING id', who.accountId, who.name, NOV_17, NOV_17)
}

export async function ready(): Promise<void> {
  setClock(NOV_17)
  resetRateLimits()
  // No challenge key, as on a theatre that has not set one: the check is then quietly off.
  ;(env as unknown as Record<string, string>).CORE_TURNSTILE_SECRET_KEY = ''
  await account(author)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    await unit.commit()
  })
}

export const question = (id: string, more: Partial<Question> = {}): Question => ({ kind: 'question', id, key: id.replace(/-/g, '_'), type: 'text.short', label: `Question ${id}`, dataClass: 'internal', ...more })
export const definition = (...questions: Question[]): Definition => ({ format: 1, pages: [{ id: 'page-1', title: 'About you', items: questions }] })

let n = 0
export async function form(title = `Form ${++n}`, actor = author): Promise<string> {
  const made = await req('POST', '/api/forms/forms', { title }, actor)
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body.formId
}

/** Saves a draft from the revision the form is at, and returns the new revision. */
export async function save(formId: string, def: Definition, actor = author): Promise<number> {
  const { body } = await req('GET', `/api/forms/forms/${formId}`, undefined, actor)
  const saved = await req('PUT', `/api/forms/forms/${formId}/draft`, { definition: def, editRevision: body.draft.editRevision }, actor)
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
  return saved.body.editRevision
}

export async function publish(formId: string, def: Definition, more: Record<string, unknown> = {}) {
  const editRevision = await save(formId, def)
  return req('POST', `/api/forms/forms/${formId}/publish`, { editRevision, ...more })
}

/** As `req`, for a reply that is not JSON. */
export async function raw(method: string, path: string, actor: ReturnType<typeof person> | null = author): Promise<{ status: number, text: string, type: string | null }> {
  const response = await call(handle, method, path, { actor: actor ?? undefined })
  return { status: response.status, text: await response.text(), type: response.headers.get('content-type') }
}

export const OPEN = { audience: 'anyone', opensAt: null, closesAt: null, responseCap: null, onePerPerson: false, status: 'active' } as const

/** A published form on a link, and its address. */
export async function offered(def: Definition, link: Record<string, unknown> = {}, more: { title?: string, anonymous?: boolean } = {}): Promise<{ formId: string, slug: string }> {
  const formId = await form(more.title)
  const patched = await req('PATCH', `/api/forms/forms/${formId}`, { retentionDays: 365, ...(more.anonymous ? { anonymous: true } : {}) })
  expect(patched.status, JSON.stringify(patched.body)).toBe(200)
  const published = await publish(formId, def)
  expect(published.status, JSON.stringify(published.body)).toBe(200)
  const linked = await req('PUT', `/api/forms/forms/${formId}/link`, { ...OPEN, ...link })
  expect(linked.status, JSON.stringify(linked.body)).toBe(200)
  const { body } = await req('GET', `/api/forms/forms/${formId}`)
  return { formId, slug: body.form.slug }
}

/** Sends answers to a form's link as somebody, or as nobody signed in. */
export const send = (slug: string, answers: Record<string, unknown>, actor: ReturnType<typeof person> | null, more: Record<string, unknown> = {}) =>
  req('POST', `/api/forms/open/${slug}/responses`, { responseId: newId('fres'), answers, ...more }, actor)
