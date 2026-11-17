// Shared set-up for the forms tests: the routes mounted, an author, and a helper that starts a form.
import { expect } from 'vitest'
import { newId, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, person, rows, server } from '../../../../tests/integration/helpers'
import formsGet from '../../server/api/forms/forms/index.get'
import formsPost from '../../server/api/forms/forms/index.post'
import formGet from '../../server/api/forms/forms/[id].get'
import formPatch from '../../server/api/forms/forms/[id].patch'
import draftPut from '../../server/api/forms/forms/[id]/draft.put'
import publishGet from '../../server/api/forms/forms/[id]/publish.get'
import publishPost from '../../server/api/forms/forms/[id]/publish.post'
import exportGet from '../../server/api/forms/forms/[id]/export.get'
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
  await account(author)
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
