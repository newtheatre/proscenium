// Templates (FB-208): the working examples a new form can start from. Those the platform ships are
// files (shared/templates.ts); a theatre's own are rows it saved from its forms. A form made from
// either is a copy, and nothing ties it to the template afterwards but the key it remembers.
import { all, first, newId, refuse, type UnitView } from '#kit'
import type { Definition } from '../shared/engine'
import { questionsOf } from '../shared/engine'
import { SHIPPED_TEMPLATES } from '../shared/templates'
import { parseOrRefuse } from './forms'

export interface TemplateInfo {
  key: string
  /** A translation key for a shipped template; the theatre's own words for one of its own. */
  name: string
  description: string | null
  own: boolean
  anonymous: boolean
  questions: number
}
interface Row { id: string, name: string, description: string | null, definition: string }

const count = (def: Definition) => questionsOf(def).length

/** Every template a new form can start from: the shipped ones first, then the theatre's own by name. */
export async function listTemplates(): Promise<TemplateInfo[]> {
  const own = await all<Row>('SELECT id, name, description, definition FROM forms_templates ORDER BY name COLLATE NOCASE, id')
  return [
    ...SHIPPED_TEMPLATES.map(t => ({ key: t.key, name: t.name, description: t.description, own: false, anonymous: !!t.anonymous, questions: count(t.definition) })),
    ...own.map(r => ({ key: r.id, name: r.name, description: r.description, own: true, anonymous: false, questions: count(JSON.parse(r.definition) as Definition) })),
  ]
}

/** What a form started from this template begins with. A copy: changing it changes nothing else. */
export async function startFrom(key: string): Promise<{ definition: Definition, anonymous: boolean, retentionDays: number | null }> {
  const shipped = SHIPPED_TEMPLATES.find(t => t.key === key)
  if (shipped) return { definition: structuredClone(shipped.definition), anonymous: !!shipped.anonymous, retentionDays: shipped.retentionDays }
  const row = await first<Row>('SELECT id, name, description, definition FROM forms_templates WHERE id = ?', key)
  if (!row) return refuse('forms.template.not-found', 'This template is no longer there.', { status: 404, remedy: 'Choose another, or start with a blank form.' }) // not-policy: HTTP status
  return { definition: await parseOrRefuse(JSON.parse(row.definition)), anonymous: false, retentionDays: null }
}

/**
 * A template leaves behind what belongs to the form it came from: the people named as reviewers.
 * The questions, stages and wording all come along.
 */
export function forTemplate(def: Definition): Definition {
  const copy = structuredClone(def)
  for (const stage of copy.workflow?.stages ?? []) {
    if (stage.review?.reviewers.people) delete stage.review.reviewers.people
  }
  return copy
}

export function saveTemplate(unit: UnitView, input: { name: string, description: string | null, definition: Definition, actorId: string, at: number, from?: string }): string {
  const id = newId('ftpl')
  unit.add({ sql: 'INSERT INTO forms_templates (id, name, description, definition, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [id, input.name, input.description, JSON.stringify(input.definition), input.actorId, input.at] })
  unit.audit({ action: 'create', record: ['forms.template', id], detail: input.from ? { formId: input.from } : {} })
  return id
}
