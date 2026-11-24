// Version history (screen 9): every published version stays readable as it was, with what changed
// and how many responses it took, and an earlier one can be made the draft again.
import { beforeAll, describe, expect, it } from 'vitest'
import { person, rows } from '../../../../tests/integration/helpers'
import { account, definition, offered, publish, question, ready, req, save, send } from './stage'

const member = person([], { name: 'Mo Member' })
beforeAll(async () => {
  await ready()
  await account(member)
})

describe('version history', () => {
  it('lists each version with its changes and responses, and opens any of them as it was published', async () => {
    const first = definition(question('name'))
    const { formId, slug } = await offered(first)
    await send(slug, { name: 'Mo' }, member)
    const second = definition(question('name'), question('why', { type: 'text.long' }))
    expect((await publish(formId, second)).status).toBe(200)

    const list = await req('GET', `/api/forms/forms/${formId}/versions`)
    expect(list.status, JSON.stringify(list.body)).toBe(200)
    expect(list.body.versions.map((v: { number: number, live: boolean, responses: number, publishedBy: string }) => [v.number, v.live, v.responses, v.publishedBy])).toEqual([[2, true, 0, 'Ada Author'], [1, false, 1, 'Ada Author']])
    expect(list.body.versions[0].summary.changes).toEqual([expect.objectContaining({ kind: 'added', questionId: 'why' })])

    const one = await req('GET', `/api/forms/forms/${formId}/versions/1`)
    expect(one.body.definition.pages[0].items.map((i: { id: string }) => i.id)).toEqual(['name'])
    expect((await req('GET', `/api/forms/forms/${formId}/versions/9`)).status).toBe(404)
    expect((await req('GET', `/api/forms/forms/${formId}/versions/x`)).status).toBe(404)
    expect((await req('GET', `/api/forms/forms/${formId}/versions`, undefined, member)).status).toBe(403)

    // An earlier version becomes the draft by saving it as one; nothing is published by that.
    await save(formId, one.body.definition)
    const after = await req('GET', `/api/forms/forms/${formId}`)
    expect(after.body.draft.definition.pages[0].items).toHaveLength(1)
    expect(after.body.form.liveVersion).toBe(2)
  })
})

describe('publishing a long form', () => {
  it('records every question in a fixed number of statements, however many there are', async () => {
    const many = Array.from({ length: 120 }, (_, i) => question(`q${i}`)) // not-policy: more questions than the statement limit
    const { formId } = await offered(definition(...many))
    const fields = () => rows<{ id: string, retired: number | null }>('SELECT question_id AS id, retired_in_version AS retired FROM forms_fields WHERE form_id = ? ORDER BY question_id', formId)
    expect((await fields()).filter(f => f.retired === null)).toHaveLength(120)

    const fewer = await publish(formId, definition(...many.slice(0, 10)), { confirm: true })
    expect(fewer.status, JSON.stringify(fewer.body)).toBe(200)
    const after = await fields()
    expect(after.filter(f => f.retired === null)).toHaveLength(10)
    expect(after.filter(f => f.retired === 2)).toHaveLength(110)
  })
})
