// The emailed link for sending changes (R-19): somebody who answered signed out and whose response
// is returned for changes gets a fresh single-use link, reads their response and the note through
// it, and sends their changes once. A new link replaces the one before; only its hash is stored.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, openSpecial, setClock } from '#kit'
import { deliver, inContext, person, rows } from '../../../../tests/integration/helpers'
import { sendReminders } from '../../server/reminders'
import { NOV_17, account, definition, handle, offered, question, ready, req, send } from './stage'
import type { Definition } from '../../shared/engine'
import { reviewWorkflow } from '../../shared/engine'

const DAY = 86_400_000
const decider = person(['forms.response.decide'], { name: 'Dee Decider' })

beforeAll(async () => {
  await ready()
  await account(decider)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.site.origin', 'https://theatre.example', { reason: 'test', confirm: true })
    await unit.commit()
  })
})

const names = { received: 'Received', review: 'In review', returned: 'Back with you', approved: 'Approved', declined: 'Declined', start: 'Start review', back: 'Return for changes', resubmit: 'Send changes', approve: 'Approve', decline: 'Decline' }
function staged(): Definition {
  const workflow = reviewWorkflow(names)
  // Staff may also decline a response that is back with its person.
  workflow.transitions.push({ key: 'give_up', from: 'returned', to: 'declined', label: 'Decline', who: 'staff' })
  return { ...definition(question('name', { required: true })), workflow }
}
const move = (formId: string, id: string, key: string, note?: string) => req('POST', `/api/forms/forms/${formId}/responses/${id}/move`, { move: key, note }, decider)

/** The token in the newest email of this type about this response. */
async function linkIn(type: string, responseId: string): Promise<string> {
  const [row] = await rows<{ sealed: string }>('SELECT sealed_variables AS sealed FROM core_notifications WHERE type_key = ? AND subject_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', type, responseId)
  expect(row, `no ${type}`).toBeTruthy()
  const { link } = JSON.parse((await inContext(() => openSpecial(row!.sealed)))!) as { link: string }
  expect(link).toMatch(/^https:\/\/theatre\.example\/forms\/changes\//)
  return link.split('/').at(-1)!
}

async function returnedGuest(email: string) {
  setClock(NOV_17)
  const { formId, slug } = await offered(staged(), {}, { title: 'Show proposals' })
  const { responseId, reference } = (await send(slug, { name: 'Gia' }, null, { email })).body
  await move(formId, responseId, 'start_review')
  expect((await move(formId, responseId, 'return', 'Please add your surname.')).status).toBe(200)
  return { formId, responseId, reference }
}

describe('the link for changes', () => {
  it('is emailed on return, opens the response and the note as often as needed, and is spent by sending', async () => {
    const { responseId, reference } = await returnedGuest('gia@example.org')
    const [sent] = await rows<{ address: string, payload: string }>('SELECT address, payload FROM core_notifications WHERE type_key = \'forms.returned-guest\' AND subject_id = ?', responseId)
    expect(sent).toMatchObject({ address: 'gia@example.org' })
    expect(JSON.parse(sent!.payload)).toMatchObject({ form: 'Show proposals', reference })
    expect(sent!.payload).not.toContain('/forms/changes/')
    const token = await linkIn('forms.returned-guest', responseId)
    // Only the hash is kept.
    const [held] = await rows<{ hash: string }>('SELECT change_token_hash AS hash FROM forms_responses WHERE id = ?', responseId)
    expect(held!.hash).toBeTruthy()
    expect(held!.hash).not.toBe(token)

    for (let i = 0; i < 2; i++) {
      const opened = await req('GET', `/api/forms/changes/${token}`, undefined, null)
      expect(opened.status, JSON.stringify(opened.body)).toBe(200)
      expect(opened.body).toMatchObject({ response: { reference }, form: { title: 'Show proposals' }, progress: { kind: 'returned', note: 'Please add your surname.', canChange: true }, values: { name: 'Gia' } })
      expect(opened.body.definition.workflow).toBeUndefined()
    }

    // Answers that are not valid are refused, and the link still works.
    expect((await req('PUT', `/api/forms/changes/${token}`, { answers: {} }, null)).status).toBe(422)
    const changed = await req('PUT', `/api/forms/changes/${token}`, { answers: { name: 'Gia Grey' } }, null)
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect(changed.body).toMatchObject({ reference })
    const [now] = await rows<any>('SELECT stage_kind, current_revision, change_token_hash FROM forms_responses WHERE id = ?', responseId)
    expect(now).toMatchObject({ stage_kind: 'in_review', current_revision: 2, change_token_hash: null })
    const [last] = await rows<{ value_text: string }>('SELECT value_text FROM forms_answers WHERE response_id = ? AND revision = 2', responseId)
    expect(last!.value_text).toBe('Gia Grey')

    expect((await req('GET', `/api/forms/changes/${token}`, undefined, null)).status).toBe(404)
    expect((await req('PUT', `/api/forms/changes/${token}`, { answers: { name: 'Again' } }, null)).status).toBe(404)
  })

  it('is replaced by each new return and by the reminder, and the one before stops working', async () => {
    const { formId, responseId } = await returnedGuest('hal@example.org')
    const first = await linkIn('forms.returned-guest', responseId)
    setClock(NOV_17 + DAY)
    expect((await req('PUT', `/api/forms/changes/${first}`, { answers: { name: 'Hal' } }, null)).status).toBe(200)
    await move(formId, responseId, 'return')
    const second = await linkIn('forms.returned-guest', responseId)
    expect(second).not.toBe(first)
    expect((await req('GET', `/api/forms/changes/${second}`, undefined, null)).status).toBe(200)

    await inContext(async () => {
      const unit = createUnit()
      await sendReminders(unit.view(), NOV_17 + 9 * DAY)
      await unit.commit()
    })
    const third = await linkIn('forms.returned-reminder-guest', responseId)
    setClock(NOV_17 + 9 * DAY)
    expect((await req('GET', `/api/forms/changes/${second}`, undefined, null)).status).toBe(404)
    expect((await req('GET', `/api/forms/changes/${third}`, undefined, null)).status).toBe(200)
  })

  it('stops working when it runs out, or when staff move the response on', async () => {
    const { responseId } = await returnedGuest('ivy@example.org')
    const token = await linkIn('forms.returned-guest', responseId)
    setClock(NOV_17 + 31 * DAY)
    expect((await req('GET', `/api/forms/changes/${token}`, undefined, null)).status).toBe(404)

    const other = await returnedGuest('jo@example.org')
    const theirs = await linkIn('forms.returned-guest', other.responseId)
    expect((await req('GET', `/api/forms/changes/${theirs}`, undefined, null)).status).toBe(200)
    expect((await move(other.formId, other.responseId, 'give_up')).status).toBe(200)
    expect((await req('GET', `/api/forms/changes/${theirs}`, undefined, null)).status).toBe(404)
    expect((await req('GET', '/api/forms/changes/nonsense', undefined, null)).status).toBe(404)
  })
})

describe('files sent through the link', () => {
  const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF')
  const upload = async (token: string, question: string) => {
    const q = new URLSearchParams({ question, name: 'script.pdf', type: 'application/pdf' })
    const response = await handle(new Request(`http://test/api/forms/changes/${token}/files?${q}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'host': 'test' }, body: PDF }))
    return { status: response.status, body: await response.json() as any }
  }

  it('are added to a file question, checked, and kept with the changes', async () => {
    setClock(NOV_17)
    const def = { ...definition(question('name', { required: true }), question('script', { type: 'file', dataClass: 'personal' })), workflow: staged().workflow }
    const { formId, slug } = await offered(def, {}, { title: 'Scripts' })
    const { responseId } = (await send(slug, { name: 'Gia' }, null, { email: 'gia.files@example.org' })).body
    await move(formId, responseId, 'start_review')
    await move(formId, responseId, 'return', 'Please attach your script.')
    const token = await linkIn('forms.returned-guest', responseId)

    expect((await upload(token, 'name')).body.code).toBe('forms.files.not-a-file-question')
    expect((await upload('not-a-link', 'script')).status).toBe(404)
    const up = await upload(token, 'script')
    expect(up.status, JSON.stringify(up.body)).toBe(200)
    await deliver()
    expect((await req('GET', `/api/forms/changes/${token}/files/${up.body.id}`, undefined, null)).body).toMatchObject({ state: 'ready' })

    const changed = await req('PUT', `/api/forms/changes/${token}`, { answers: { name: 'Gia', script: [{ id: up.body.id, name: 'x', size: 1, type: 'x' }] } }, null)
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect(await rows('SELECT state, attached_at IS NOT NULL AS attached FROM core_files WHERE id = ?', up.body.id)).toEqual([{ state: 'ready', attached: 1 }])
    // The link is spent, so nothing more can be uploaded with it.
    expect((await upload(token, 'script')).status).toBe(404)
  })
})
