// Templates (FB-208, FB-510): a new form starts from a shipped template, one another module ships
// (forms.template) or one the theatre saved, and is its own form from then on.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { useRegistry } from '#kit/registry'
import { person, rows, setModule } from '../../../../tests/integration/helpers'
import { account, author, definition, form, question, ready, req, save } from './stage'
import { checkDefinition, reviewWorkflow } from '../../shared/engine'
import issueAward from '../../../awards/server/contributions/forms.outcome-action/issue-award'

const keeper = person(['forms.form.create', 'forms.form.edit', 'forms.template.manage'], { name: 'Kit Keeper', reassertedAt: Date.UTC(2026, 10, 17, 12) })
beforeAll(async () => {
  await ready()
  await account(keeper)
})
const draftOf = async (formId: string, actor = author) => (await req('GET', `/api/forms/forms/${formId}`, undefined, actor)).body.draft.definition

describe('templates', () => {
  it('lists the shipped templates, and a form started from one is a copy that remembers which', async () => {
    const list = await req('GET', '/api/forms/templates')
    expect(list.status).toBe(200)
    expect(list.body.canManage).toBe(false)
    expect(list.body.templates.map((t: { key: string }) => t.key)).toEqual(expect.arrayContaining(['forms.show-proposal', 'forms.access-requirements', 'forms.feedback-survey']))
    expect(list.body.templates.find((t: { key: string }) => t.key === 'forms.feedback-survey')).toMatchObject({ own: false, anonymous: true, questions: 4 })

    const made = await req('POST', '/api/forms/forms', { title: 'After the show', template: 'forms.feedback-survey' })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    const def = await draftOf(made.body.formId)
    expect(def.pages[0].items.map((i: { id: string }) => i.id)).toEqual(['overall', 'heard', 'again', 'comments'])
    expect((await rows('SELECT template_key, anonymous FROM forms_forms WHERE id = ?', made.body.formId))[0]).toEqual({ template_key: 'forms.feedback-survey', anonymous: 1 })
    // The proposal comes with its stages and its total.
    const proposal = await req('POST', '/api/forms/forms', { title: 'Spring proposals', template: 'forms.show-proposal' })
    const stages = await draftOf(proposal.body.formId)
    expect(stages.workflow.stages).toHaveLength(5)
    expect(stages.calculations[0].key).toBe('total')
    expect((await req('POST', '/api/forms/forms', { title: 'Nothing', template: 'ftpl_nothing' })).body.code).toBe('forms.template.not-found')
  })

  it('saves a form as the theatre\'s own template, without the people it named, and starts new forms from it', async () => {
    const formId = await form('Workshop sign-up', keeper)
    const workflow = reviewWorkflow({ received: 'Received', review: 'In review', returned: 'Back', approved: 'Approved', declined: 'Declined', start: 'Start', back: 'Return', resubmit: 'Send', approve: 'Approve', decline: 'Decline' })
    workflow.stages[1]!.review = { mode: 'vote', reviewers: { role: 'administrator', people: [keeper.accountId!] }, pass: 'majority' }
    await save(formId, { ...definition(question('name'), question('why', { type: 'text.long' })), workflow }, keeper)

    // Not for somebody who cannot manage templates, nor from a form they cannot edit.
    expect((await req('POST', '/api/forms/templates', { name: 'Sign-up', formId })).status).toBe(403)
    const other = await form('Somebody else\'s')
    expect((await req('POST', '/api/forms/templates', { name: 'Theirs', formId: other }, person(['forms.template.manage'], { name: 'Tess Template' }))).status).toBe(403)
    expect((await req('POST', '/api/forms/templates', { name: 'Nothing' }, keeper)).body.code).toBe('forms.template.nothing')

    const saved = await req('POST', '/api/forms/templates', { name: 'Sign-up', description: 'For workshops', formId }, keeper)
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const list = await req('GET', '/api/forms/templates', undefined, keeper)
    expect(list.body.canManage).toBe(true)
    expect(list.body.templates.at(-1)).toEqual({ key: saved.body.templateId, name: 'Sign-up', description: 'For workshops', own: true, anonymous: false, questions: 2, mode: null, slots: [], module: null })

    // Changing the form afterwards changes nothing in the template.
    await save(formId, definition(question('name')), keeper)
    const made = await req('POST', '/api/forms/forms', { title: 'Summer workshop', template: saved.body.templateId }, keeper)
    const def = await draftOf(made.body.formId, keeper)
    expect(def.pages[0].items).toHaveLength(2)
    expect(def.workflow.stages[1].review.reviewers).toEqual({ role: 'administrator' })

    // Removed, it can be put back from what the reply carried; forms made from it stay.
    const gone = await req('DELETE', `/api/forms/templates/${saved.body.templateId}`, {}, keeper)
    expect(gone.status, JSON.stringify(gone.body)).toBe(200)
    expect((await req('DELETE', `/api/forms/templates/${saved.body.templateId}`, {}, keeper)).status).toBe(404)
    expect((await req('GET', `/api/forms/forms/${made.body.formId}`, undefined, keeper)).status).toBe(200)
    const back = await req('POST', '/api/forms/templates', gone.body.removed, keeper)
    expect(back.status, JSON.stringify(back.body)).toBe(200)
    expect((await req('GET', '/api/forms/templates', undefined, keeper)).body.templates.at(-1)).toMatchObject({ name: 'Sign-up', questions: 2 })
  })
})

describe('templates other modules ship', () => {
  type Listed = { key: string, mode: string | null, slots: string[], module: string | null }
  const listed = async () => (await req('GET', '/api/forms/templates')).body.templates as Listed[]
  let restore = () => {}
  beforeAll(() => setModule('awards', true))
  afterAll(async () => {
    restore()
    await setModule('awards', false)
  })

  it('offers them beside the shipped ones, with the mode and slots they suit, while their module is on', async () => {
    const all = await listed()
    expect(all.find(t => t.key === 'awards.nomination')).toMatchObject({ own: false, mode: 'submission', slots: ['awards.nomination'], module: 'awards', questions: 3 })
    expect(all.find(t => t.key === 'gallery.show-fields')).toMatchObject({ mode: 'record', slots: ['gallery.show-fields'], module: 'gallery' })
    // Shipped first, then the modules', then the theatre's own.
    expect(all.findIndex(t => t.key === 'forms.feedback-survey')).toBeLessThan(all.findIndex(t => t.key === 'awards.nomination'))
    // Every slot a template names is one a module declares.
    const slots = new Set([...useRegistry().modules.values()].flatMap(m => ((m.manifest.contributes as Record<string, { id: string }[]> | undefined)?.['forms.slot'] ?? []).map(s => s.id)))
    for (const t of all) for (const slot of t.slots) expect(slots.has(slot), `${t.key} names ${slot}`).toBe(true)

    await setModule('awards', false)
    try {
      expect((await listed()).some(t => t.key === 'awards.nomination')).toBe(false)
      expect((await req('POST', '/api/forms/forms', { title: 'Nominations', template: 'awards.nomination' })).body.code).toBe('forms.template.not-found')
    }
    finally {
      await setModule('awards', true)
    }
  })

  it('makes a copy in the template\'s mode, with the moves it carries', async () => {
    const fields = await req('POST', '/api/forms/forms', { title: 'Show details', template: 'gallery.show-fields' })
    expect(fields.status, JSON.stringify(fields.body)).toBe(200)
    expect((await rows('SELECT mode, template_key FROM forms_forms WHERE id = ?', fields.body.formId))[0]).toEqual({ mode: 'record', template_key: 'gallery.show-fields' })

    const made = await req('POST', '/api/forms/forms', { title: 'Long service nominations', template: 'awards.nomination' })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    const def = await draftOf(made.body.formId)
    expect(def.workflow.transitions.find((t: { key: string }) => t.key === 'approve').actions[0].action).toBe('awards.issue-award')
    // Its action is wired as awards asks: the publish check, with awards' action offered, finds no error.
    expect(checkDefinition(def, { actions: [issueAward], sources: ['core.person'] }).filter(p => p.level === 'error')).toEqual([])
  })

  it('leaves out one that fails the checks the shipped ones pass', async () => {
    const entry = useRegistry().modules.get('forms')!
    const before = { contributes: entry.manifest.contributes, handlers: entry.handlers.contributions }
    const broken = { key: 'forms.broken', name: 'x', description: 'y', definition: { format: 1, pages: [{ id: 'page-1', title: '', items: [{ kind: 'question', id: 'q', key: 'q', type: 'text.short', label: '', dataClass: 'internal' }] }] } }
    const stranger = { key: 'awards.not-mine', name: 'x', description: 'y', definition: { format: 1, pages: [] } }
    ;(entry.manifest as any).contributes = { ...before.contributes, 'forms.template': [{ id: 'forms.broken', file: 'broken' }, { id: 'forms.stranger', file: 'stranger' }] }
    ;(entry.handlers as any).contributions = { ...before.handlers, 'forms.template': { broken, stranger } }
    restore = () => {
      ;(entry.manifest as any).contributes = before.contributes
      ;(entry.handlers as any).contributions = before.handlers
    }
    const keys = (await listed()).map(t => t.key)
    expect(keys).not.toContain('forms.broken')
    expect(keys).not.toContain('awards.not-mine')
    expect(keys).toContain('awards.nomination')
    restore()
  })
})
