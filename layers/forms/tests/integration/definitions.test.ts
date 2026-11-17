// A form, its draft and its versions (FB-201, FB-207, and import and export from FB-510): a draft
// saves itself and refuses a stale save, publishing makes a version the database will not change,
// and what the specification forbids between versions is refused.
import { beforeAll, describe, expect, it } from 'vitest'
import { person, rows } from '../../../../tests/integration/helpers'
import { account, author, definition, form, publish, question, ready, req, save } from './stage'

beforeAll(ready)

describe('starting a form', () => {
  it('needs the ability, and gives the form a draft of one empty page', async () => {
    expect((await req('POST', '/api/forms/forms', { title: 'Auditions' }, person([]))).status).toBe(403)
    const id = await form('Auditions')
    const { body } = await req('GET', `/api/forms/forms/${id}`)
    expect(body.form).toMatchObject({ slug: 'auditions', title: 'Auditions', status: 'draft', mode: 'submission', liveVersion: null })
    expect(body.draft).toMatchObject({ editRevision: 0, editedBy: 'Ada Author', definition: { format: 1, pages: [{ id: 'page-1', items: [] }] } })
    expect(body.versions).toEqual([])
  })

  it('gives a second form of the same title the next free address', async () => {
    await form('Crew sign-up')
    const second = await req('POST', '/api/forms/forms', { title: 'Crew sign-up!' })
    expect(second.body.slug).toBe('crew-sign-up-2')
  })

  it('lets its creator edit it without the site-wide ability, and nobody else', async () => {
    const creator = person(['forms.form.create'], { name: 'Cy Creator' })
    const id = await form('Mine', creator)
    expect((await req('GET', `/api/forms/forms/${id}`, undefined, creator)).status).toBe(200)
    expect((await req('GET', `/api/forms/forms/${id}`, undefined, person([]))).status).toBe(403)
    expect((await req('GET', '/api/forms/forms', undefined, creator)).body.forms.map((f: any) => f.id)).toEqual([id])
    expect((await req('GET', '/api/forms/forms')).body.forms.map((f: any) => f.id)).toContain(id)
  })
})

describe('saving the draft', () => {
  it('keeps the definition and raises the revision', async () => {
    const id = await form()
    expect(await save(id, definition(question('name')))).toBe(1)
    const { body } = await req('GET', `/api/forms/forms/${id}`)
    expect(body.draft.definition.pages[0].items[0]).toMatchObject({ id: 'name', key: 'name' })
    expect(body.draft.editRevision).toBe(1)
  })

  it('refuses a save from a stale revision and says who saved last', async () => {
    const id = await form()
    const other = person(['forms.form.edit'], { name: 'Bo Builder' })
    await account(other)
    await save(id, definition(question('name')), other)
    const late = await req('PUT', `/api/forms/forms/${id}/draft`, { definition: definition(question('other')), editRevision: 0 })
    expect(late.status).toBe(409)
    expect(late.body.code).toBe('forms.draft.stale')
    expect(late.body.reason).toContain('Bo Builder')
    expect((await req('GET', `/api/forms/forms/${id}`)).body.draft.definition.pages[0].items[0].id).toBe('name')
  })

  it('refuses a definition that does not match the format, and one over a limit', async () => {
    const id = await form()
    const wrong = await req('PUT', `/api/forms/forms/${id}/draft`, { definition: { format: 1, pages: [{ id: 'p', title: '', items: [{ kind: 'question', id: 'a' }] }] }, editRevision: 0 })
    expect(wrong.status).toBe(422)
    expect(wrong.body.code).toBe('forms.definition.invalid')
    const twice = await req('PUT', `/api/forms/forms/${id}/draft`, { definition: definition(question('a'), question('a')), editRevision: 0 })
    expect(twice.status).toBe(422)
    expect(Object.values(twice.body.fields)).toContain('forms.definition.duplicate-id')
  })
})

describe('publishing', () => {
  it('makes version 1, sets the form live and writes the field catalogue', async () => {
    const id = await form()
    const editRevision = await save(id, definition(question('name'), question('role', { type: 'choice.single', options: [{ id: 'o1', label: 'Cast' }, { id: 'o2', label: 'Crew' }] })))
    const plan = await req('GET', `/api/forms/forms/${id}/publish`)
    expect(plan.body).toMatchObject({ number: 1, impact: 'safe', unchanged: false, refusals: [] })
    expect(plan.body.changes.map((c: any) => [c.kind, c.questionId])).toEqual([['added', 'name'], ['added', 'role']])
    const done = await req('POST', `/api/forms/forms/${id}/publish`, { editRevision })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body).toMatchObject({ number: 1, impact: 'safe' })
    const { body } = await req('GET', `/api/forms/forms/${id}`)
    expect(body.form).toMatchObject({ status: 'live', liveVersion: 1 })
    expect(body.versions).toHaveLength(1)
    expect(await rows('SELECT question_id, type, first_version, retired_in_version FROM forms_fields WHERE form_id = ? ORDER BY question_id', id)).toEqual([
      { question_id: 'name', type: 'text.short', first_version: 1, retired_in_version: null },
      { question_id: 'role', type: 'choice.single', first_version: 1, retired_in_version: null },
    ])
  })

  it('needs the ability to publish, which the creator does not have by owning the form', async () => {
    const creator = person(['forms.form.create'])
    const id = await form('Owned', creator)
    expect((await req('POST', `/api/forms/forms/${id}/publish`, { editRevision: 0 }, creator)).status).toBe(403)
  })

  it('refuses a form with a problem, and one with nothing changed', async () => {
    const id = await form()
    const bad = await publish(id, definition(question('name', { label: '' })))
    expect(bad.status).toBe(422)
    expect(bad.body.code).toBe('forms.publish.problems')
    expect((await publish(id, definition(question('name')))).status).toBe(200)
    const again = await req('POST', `/api/forms/forms/${id}/publish`, { editRevision: 2 })
    expect(again.body.code).toBe('forms.publish.unchanged')
  })

  it('has the database refuse any change to a published version', async () => {
    const id = await form()
    await publish(id, definition(question('name')))
    await expect(rows('UPDATE forms_versions SET definition = ? WHERE form_id = ? RETURNING id', '{}', id)).rejects.toThrow(/append-only/)
    await expect(rows('DELETE FROM forms_versions WHERE form_id = ? RETURNING id', id)).rejects.toThrow(/append-only/)
  })

  it('refuses a changed type and a lowered data class, and allows a raised one', async () => {
    const id = await form()
    await publish(id, definition(question('name', { dataClass: 'personal' })), {})
    // Personal answers need a retention first.
    expect((await req('GET', `/api/forms/forms/${id}/publish`)).body.refusals.map((r: any) => r.code)).toEqual(['forms.publish.retention-needed'])
    expect((await req('PATCH', `/api/forms/forms/${id}`, { retentionDays: 365 })).status).toBe(200)
    expect((await req('POST', `/api/forms/forms/${id}/publish`, { editRevision: 1 })).status).toBe(200)
    expect((await publish(id, definition(question('name', { dataClass: 'personal', type: 'text.long' })))).body.code).toBe('forms.publish.type-changed')
    expect((await publish(id, definition(question('name', { dataClass: 'internal' })))).body.code).toBe('forms.publish.class-lowered')
    const raised = await publish(id, definition(question('name', { dataClass: 'special' })))
    expect(raised.status, JSON.stringify(raised.body)).toBe(200)
    expect(await rows('SELECT data_class FROM forms_fields WHERE form_id = ?', id)).toEqual([{ data_class: 'special' }])
  })

  it('classes a new required question as caution and a retired one as breaking, which needs confirming', async () => {
    const id = await form()
    await publish(id, definition(question('name'), question('bio')))
    const caution = await publish(id, definition(question('name'), question('bio'), question('age', { type: 'number', required: true })))
    expect(caution.body).toMatchObject({ number: 2, impact: 'caution' })
    const breaking = definition(question('name'), question('age', { type: 'number', required: true }))
    const asked = await publish(id, breaking)
    expect(asked.status).toBe(409)
    expect(asked.body.code).toBe('forms.publish.confirm-needed')
    expect(asked.body.reason).toContain('Question bio')
    const done = await publish(id, breaking, { confirm: true })
    expect(done.body).toMatchObject({ number: 3, impact: 'breaking' })
    expect(await rows('SELECT retired_in_version FROM forms_fields WHERE form_id = ? AND question_id = ?', id, 'bio')).toEqual([{ retired_in_version: 3 }])
    // A retired question's export name is never given to another question.
    expect((await publish(id, definition(question('name'), question('age', { type: 'number', required: true }), question('biography', { key: 'bio' })))).body.code).toBe('forms.publish.key-taken')
  })

  it('refuses a publish from a revision that is no longer the draft', async () => {
    const id = await form()
    await save(id, definition(question('name')))
    expect((await req('POST', `/api/forms/forms/${id}/publish`, { editRevision: 0 })).body.code).toBe('forms.draft.stale')
  })
})

describe('a form as a file', () => {
  it('exports the draft and imports it as a new form, any number of times', async () => {
    const id = await form('Nominations')
    await save(id, definition(question('who'), question('why', { type: 'text.long' })))
    const file = await req('GET', `/api/forms/forms/${id}/export`)
    expect(file.body).toMatchObject({ file: 'proscenium.form', fileVersion: 1, title: 'Nominations' })
    for (const slug of ['nominations-2', 'nominations-3']) {
      const made = await req('POST', '/api/forms/forms', { title: file.body.title, definition: file.body.definition })
      expect(made.status, JSON.stringify(made.body)).toBe(200)
      expect(made.body.slug).toBe(slug)
      expect((await req('GET', `/api/forms/forms/${made.body.formId}`)).body.draft.definition).toEqual(file.body.definition)
    }
  })

  it('refuses a file that is not a form', async () => {
    const made = await req('POST', '/api/forms/forms', { title: 'Broken', definition: { pages: 'none' } })
    expect(made.status).toBe(422)
    expect(made.body.code).toBe('forms.definition.invalid')
    expect(await rows('SELECT id FROM forms_forms WHERE title = ?', 'Broken')).toEqual([])
  })

  it('fixes whether a form is anonymous once it is published', async () => {
    const id = await form()
    expect((await req('PATCH', `/api/forms/forms/${id}`, { anonymous: true, title: 'Feedback' })).status).toBe(200)
    await publish(id, definition(question('name')))
    expect((await req('PATCH', `/api/forms/forms/${id}`, { anonymous: false })).body.code).toBe('forms.form.anonymous-fixed')
    expect((await req('GET', `/api/forms/forms/${id}`)).body.form).toMatchObject({ title: 'Feedback', anonymous: true })
    expect(author.name).toBe('Ada Author')
  })
})
