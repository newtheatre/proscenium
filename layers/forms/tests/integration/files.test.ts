// File answers (F03): uploaded while answering into core's store under the response, checked by
// core's job, sent only once checked, read by whoever may read the response, exported with their
// address, and removed with the answer that holds them at retention, at erasure, or if never sent.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createUnit, newId, nowMs } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, deliver, inContext, person, rows, sent, server } from '../../../../tests/integration/helpers'
import { eraseAccount } from '../../../core/server/identity/erasure'
import serveFile from '../../../core/server/routes/files/[id].get'
import { sweepRetention } from '../../server/retention'
import { sweepAbandonedFiles } from '../../server/files'
import { handle as forms, account, definition, offered, question, raw, ready, req } from './stage'

const files = server({ 'GET /files/:id': serveFile })
const reader = person(['forms.response.read', 'forms.response.export'], { name: 'Rae Reader', reassertedAt: Date.UTC(2026, 10, 18) })
const member = person([], { name: 'Mo Member' })
const stranger = person([], { name: 'Sam Stranger' })

const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF')

beforeAll(async () => {
  await ready()
  for (const who of [reader, member, stranger]) await account(who)
})
beforeEach(() => {
  sent.length = 0
  resetRateLimits()
})

const withFiles = (more = {}) => definition(
  question('name', { dataClass: 'personal' }),
  question('script', { type: 'file', label: 'Your script', dataClass: 'personal', validation: [{ rule: 'fileTypes', value: ['.pdf'] }, { rule: 'maxFiles', value: 2 }], ...more }),
)

async function upload(slug: string, responseId: string, bytes: Uint8Array, query: Record<string, string> = {}, actor: ReturnType<typeof person> | null = null) {
  const q = new URLSearchParams({ response: responseId, question: 'script', name: 'script.pdf', type: 'application/pdf', ...query })
  const headers: Record<string, string> = { 'content-type': 'application/octet-stream', 'host': 'test' }
  if (actor) headers['x-test-actor'] = JSON.stringify(actor)
  const response = await forms(new Request(`http://test/api/forms/open/${slug}/files?${q}`, { method: 'POST', headers, body: bytes }))
  return { status: response.status, body: await response.json() as any }
}
const sendWith = (slug: string, responseId: string, answers: Record<string, unknown>, actor: ReturnType<typeof person> | null = null) =>
  req('POST', `/api/forms/open/${slug}/responses`, { responseId, answers, ...(actor ? {} : { email: 'sender@example.org' }) }, actor)
const open = (id: string, actor?: ReturnType<typeof person>) => call(files, 'GET', `/files/${id}`, { actor })

describe('answering with a file', () => {
  it('uploads, waits for the check, and stores what core holds rather than what the page said', async () => {
    const { slug, formId } = await offered(withFiles())
    const responseId = newId('fres')
    const up = await upload(slug, responseId, PDF)
    expect(up.status, JSON.stringify(up.body)).toBe(200)
    expect(up.body).toMatchObject({ id: expect.stringMatching(/^fil_/), state: 'pending', name: 'script.pdf' })

    // Not yet checked: sending is refused beside the answer.
    const early = await sendWith(slug, responseId, { name: 'Mo', script: [{ id: up.body.id, name: 'script.pdf', size: 1, type: 'application/pdf' }] })
    expect(early.status).toBe(422)
    expect(early.body.fields).toEqual({ script: 'forms.issues.file-checking' })

    expect(await deliver()).toEqual(['done'])
    expect((await req('GET', `/api/forms/open/${slug}/files/${up.body.id}?response=${responseId}`, undefined, null)).body).toMatchObject({ state: 'ready', type: 'application/pdf' })

    const spare = await upload(slug, responseId, PDF, { name: 'spare.pdf' })
    await deliver()
    const sentOk = await sendWith(slug, responseId, { name: 'Mo', script: [{ id: up.body.id, name: 'renamed.exe', size: 1, type: 'application/x-evil' }] })
    expect(sentOk.status, JSON.stringify(sentOk.body)).toBe(200)

    const [answer] = await rows<{ value_json: string }>("SELECT value_json FROM forms_answers WHERE response_id = ? AND question_id = 'script'", responseId)
    expect(JSON.parse(answer!.value_json)).toEqual([{ id: up.body.id, name: 'script.pdf', size: PDF.length, type: 'application/pdf' }])
    const state = await rows<{ id: string, state: string, attached: number }>('SELECT id, state, attached_at IS NOT NULL AS attached FROM core_files WHERE owner_id = ? ORDER BY original_name', responseId)
    // The file sent is attached; the one uploaded and never sent is removed.
    expect(state).toEqual([{ id: up.body.id, state: 'ready', attached: 1 }, { id: spare.body.id, state: 'deleted', attached: 0 }])

    // The table names the file, and the export gives the address to open it at.
    const csv = await raw('GET', `/api/forms/forms/${formId}/responses/export`, reader)
    expect(csv.text).toContain(`script.pdf (http://test/files/${up.body.id})`)
  })

  it('is opened by somebody who may read the responses, and not by anybody else', async () => {
    const { slug } = await offered(withFiles())
    const responseId = newId('fres')
    const up = await upload(slug, responseId, PDF, {}, member)
    await deliver()
    expect((await sendWith(slug, responseId, { name: 'Mo', script: [{ id: up.body.id, name: 'x', size: 1, type: 'x' }] }, member)).status).toBe(200)
    expect((await open(up.body.id, reader)).status).toBe(200)
    expect((await open(up.body.id, member)).status).toBe(200)
    expect((await open(up.body.id, stranger)).status).toBe(404)
    expect((await open(up.body.id)).status).toBe(404)
  })

  it('refuses a refused file, a file of the wrong kind, too many, and a question that takes none', async () => {
    const { slug } = await offered(withFiles({ validation: [{ rule: 'fileTypes', value: ['.pdf'] }, { rule: 'maxFileSize', value: 40 }] }))
    const responseId = newId('fres')
    expect((await upload(slug, responseId, PDF)).body.code).toBe('forms.files.too-large')
    const roomy = await offered(withFiles())
    expect((await upload(roomy.slug, responseId, PDF, { name: 'photo.png', type: 'image/png' })).body.code).toBe('forms.files.type')
    expect((await upload(roomy.slug, responseId, PDF, { question: 'name' })).body.code).toBe('forms.files.not-a-file-question')
    const fake = await upload(roomy.slug, responseId, new TextEncoder().encode('not a document at all'))
    await deliver()
    expect((await sendWith(roomy.slug, responseId, { name: 'Mo', script: [{ id: fake.body.id, name: 'x', size: 1, type: 'x' }] })).body.fields).toEqual({ script: 'forms.issues.file-refused' })
    // A file of another response is no answer to this one.
    const theirs = newId('fres')
    const elsewhere = await upload(roomy.slug, theirs, PDF)
    await deliver()
    expect((await sendWith(roomy.slug, responseId, { name: 'Mo', script: [{ id: elsewhere.body.id, name: 'x', size: 1, type: 'x' }] })).body.fields).toEqual({ script: 'forms.issues.file-missing' })
  })

  it('cannot be added to somebody else\'s response', async () => {
    const { slug } = await offered(withFiles())
    const responseId = newId('fres')
    const up = await upload(slug, responseId, PDF, {}, member)
    await deliver()
    expect((await sendWith(slug, responseId, { name: 'Mo', script: [{ id: up.body.id, name: 'x', size: 1, type: 'x' }] }, member)).status).toBe(200)
    expect((await upload(slug, responseId, PDF, {}, stranger)).status).toBe(404)
    expect((await upload(slug, responseId, PDF)).status).toBe(404)
  })
})

describe('when files go', () => {
  const sweep = (fn: typeof sweepRetention | typeof sweepAbandonedFiles) => inContext(async () => {
    const unit = createUnit()
    await fn(unit.view(), nowMs(), 200)
    await unit.commit()
  })

  it('a personal file goes when its response is anonymised; a public one stays', async () => {
    const def = definition(
      question('script', { type: 'file', dataClass: 'personal' }),
      question('poster', { type: 'file', dataClass: 'public' }),
    )
    const { slug } = await offered(def)
    const responseId = newId('fres')
    const script = await upload(slug, responseId, PDF)
    const poster = await upload(slug, responseId, PDF, { question: 'poster', name: 'poster.pdf' })
    await deliver()
    const ref = (id: string) => [{ id, name: 'x', size: 1, type: 'x' }]
    expect((await sendWith(slug, responseId, { script: ref(script.body.id), poster: ref(poster.body.id) })).status).toBe(200)
    await rows('UPDATE forms_responses SET retention_due_at = ? WHERE id = ? RETURNING id', nowMs() - 1, responseId)
    await sweep(sweepRetention)
    expect(await rows('SELECT id, state FROM core_files WHERE owner_id = ? ORDER BY original_name', responseId)).toEqual([
      { id: poster.body.id, state: 'ready' },
      { id: script.body.id, state: 'deleted' },
    ])
  })

  it('a person\'s files go when they are erased', async () => {
    const leaving = person([], { name: 'Lee Leaving' })
    await account(leaving)
    const { slug } = await offered(withFiles())
    const responseId = newId('fres')
    const up = await upload(slug, responseId, PDF, {}, leaving)
    await deliver()
    expect((await sendWith(slug, responseId, { name: 'Lee', script: [{ id: up.body.id, name: 'x', size: 1, type: 'x' }] }, leaving)).status).toBe(200)
    await inContext(() => eraseAccount(leaving.accountId!))
    expect(await rows('SELECT state FROM core_files WHERE id = ?', up.body.id)).toEqual([{ state: 'deleted' }])
  })

  it('a file uploaded for answers never sent goes after a week', async () => {
    const { slug } = await offered(withFiles())
    const up = await upload(slug, newId('fres'), PDF)
    await deliver()
    await rows('UPDATE core_files SET created_at = ? WHERE id = ? RETURNING id', nowMs() - 8 * 86_400_000, up.body.id)
    await sweep(sweepAbandonedFiles)
    expect(await rows('SELECT state FROM core_files WHERE id = ?', up.body.id)).toEqual([{ state: 'deleted' }])
  })
})
