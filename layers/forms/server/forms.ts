// Forms' service for a form, its draft and its published versions (stories FB-201, FB-207). A form
// has one draft, saved as its author works, and any number of published versions, each immutable.
// Publishing compares the draft with the field catalogue, refuses what the specification forbids
// (a changed type, a lowered data class) and classes the rest as safe, caution or breaking.
import { all, first, refuse, useSetting, type UnitView } from '#kit'
import { DATA_CLASSES, FORMAT, checkDefinition, parseDefinition, publishable, questionsOf, type DataClass, type Definition, type Fault, type Limits, type Problem, type Question } from '../shared/engine'

export interface FormRow {
  id: string
  slug: string
  title: string
  mode: 'submission' | 'record'
  status: 'draft' | 'live' | 'paused' | 'closed' | 'archived'
  liveVersionId: string | null
  anonymous: boolean
  retentionDays: number | null
  retentionDeclinedDays: number | null
  createdBy: string
  createdAt: number
  archivedAt: number | null
}
export interface DraftRow { definition: string, editRevision: number, editedBy: string, updatedAt: number }
export interface FieldRow { questionId: string, key: string, type: string, dataClass: DataClass, label: string, firstVersion: number, retiredInVersion: number | null }
export interface VersionRow { id: string, number: number, definition: string, definitionHash: string, changeSummary: string, publishedBy: string, publishedAt: number }

const FORM = `id, slug, title, mode, status, live_version_id AS liveVersionId, anonymous, retention_days AS retentionDays,
  retention_declined_days AS retentionDeclinedDays, created_by AS createdBy, created_at AS createdAt, archived_at AS archivedAt`

export async function getForm(id: string | undefined): Promise<FormRow | null> {
  if (!id) return null
  const row = await first<FormRow>(`SELECT ${FORM} FROM forms_forms WHERE id = ?`, id)
  return row ? { ...row, anonymous: !!row.anonymous } : null
}

export async function requireForm(id: string | undefined): Promise<FormRow> {
  return await getForm(id) ?? refuse('forms.form.not-found', 'There is no form here.', { status: 404 })
}

export async function listForms(): Promise<FormRow[]> {
  return (await all<FormRow>(`SELECT ${FORM} FROM forms_forms ORDER BY archived_at IS NOT NULL, title COLLATE NOCASE, id`)).map(r => ({ ...r, anonymous: !!r.anonymous }))
}

export async function getDraft(formId: string): Promise<DraftRow> {
  return (await first<DraftRow>('SELECT definition, edit_revision AS editRevision, edited_by AS editedBy, updated_at AS updatedAt FROM forms_drafts WHERE form_id = ?', formId))!
}

export const getFields = (formId: string) => all<FieldRow>('SELECT question_id AS questionId, key, type, data_class AS dataClass, label, first_version AS firstVersion, retired_in_version AS retiredInVersion FROM forms_fields WHERE form_id = ?', formId)

const VERSION = 'id, number, definition, definition_hash AS definitionHash, change_summary AS changeSummary, published_by AS publishedBy, created_at AS publishedAt'
export const getVersion = (id: string | null) => id ? first<VersionRow>(`SELECT ${VERSION} FROM forms_versions WHERE id = ?`, id) : Promise.resolve(null)
export const listVersions = (formId: string) => all<Omit<VersionRow, 'definition'>>('SELECT id, number, definition_hash AS definitionHash, change_summary AS changeSummary, published_by AS publishedBy, created_at AS publishedAt FROM forms_versions WHERE form_id = ? ORDER BY number DESC', formId)

export async function accountName(id: string): Promise<string | null> {
  const row = await first<{ name: string | null }>('SELECT coalesce(preferred_name, name) AS name FROM core_accounts WHERE id = ?', id)
  return row?.name ?? null
}

/** The limits a definition is held to, from the settings. */
export async function limits(): Promise<Limits> {
  const [questions, pages, kilobytes, repeatEntries, conditionDepth] = await Promise.all([
    useSetting('forms.limits.questions-per-form'), useSetting('forms.limits.pages-per-form'), useSetting('forms.limits.definition-size'),
    useSetting('forms.limits.repeat-entries'), useSetting('forms.limits.condition-depth'),
  ]) as number[] as [number, number, number, number, number]
  return { questions, pages, definitionBytes: kilobytes * 1024, repeatEntries, conditionDepth } // not-policy: bytes in a kilobyte
}

/** A new form's draft: one empty page. */
export const blankDefinition = (): Definition => ({ format: FORMAT, pages: [{ id: 'page-1', title: '', items: [] }] })

/** The definition, or a refusal that says where it breaks the format (FB-101). */
export async function parseOrRefuse(input: unknown): Promise<Definition> {
  const parsed = parseDefinition(input, await limits())
  if (parsed.ok) return parsed.definition
  refuse('forms.definition.invalid', faultSentence(parsed.faults), { status: 422, fields: Object.fromEntries(parsed.faults.slice(0, MOST_FAULTS).map(f => [`definition.${f.path.join('.')}`, `forms.definition.${f.code}`])) })
}

const MOST_FAULTS = 20 // not-policy: how many faults one refusal lists
function faultSentence(faults: Fault[]): string {
  const first = faults[0]!
  const where = first.path.length ? ` at ${first.path.join('.')}` : ''
  return faults.length === 1 ? `The form does not match the format${where}: ${first.message}` : `The form does not match the format in ${faults.length} places. The first is${where}: ${first.message}`
}

/** The address a form is reached by: its title in lower-case letters, digits and hyphens. */
export function slugOf(title: string): string {
  const slug = title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z\d]+/g, '-').replace(/^-+|-+$/g, '').slice(0, SLUG_LENGTH).replace(/-+$/, '')
  return slug || 'form'
}
const SLUG_LENGTH = 60 // not-policy: a readable address
/** The longest title a form may have. */
export const TITLE_LENGTH = 120 // not-policy: fits a list row and a page heading

/** The first free address from the title: `auditions`, then `auditions-2`, and so on. */
export async function freeSlug(title: string): Promise<string> {
  const base = slugOf(title)
  const taken = new Set((await all<{ slug: string }>('SELECT slug FROM forms_forms WHERE slug = ? OR slug LIKE ?', base, `${base}-%`)).map(r => r.slug))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export async function hashOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') // not-policy: hexadecimal
}

// --- Publishing ---

export type Impact = 'safe' | 'caution' | 'breaking'
export interface Change { kind: 'added' | 'retired' | 'changed', impact: Impact, questionId: string, label: string, what: string[] }
export interface ChangeSummary { impact: Impact, changes: Change[] }
export interface PublishPlan {
  definition: Definition
  problems: Problem[]
  /** Why this draft cannot be published at all, apart from its problems. */
  refusals: { code: string, reason: string, questionId?: string }[]
  summary: ChangeSummary
  number: number
  unchanged: boolean
  hash: string
  text: string
}

const worst = (impacts: Impact[]): Impact => impacts.includes('breaking') ? 'breaking' : impacts.includes('caution') ? 'caution' : 'safe'
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const PERSONAL: readonly DataClass[] = ['personal', 'free-text', 'special']

/** What changed in one question that both versions hold. Wording and help are safe; what could turn a kept answer away is caution. */
function questionChanges(before: Question, after: Question): { what: string[], impact: Impact } {
  const what: string[] = []
  const impacts: Impact[] = []
  const note = (name: string, impact: Impact) => (what.push(name), impacts.push(impact))
  if (before.label !== after.label || before.help !== after.help) note('wording', 'safe')
  if (before.key !== after.key) note('key', 'safe')
  if (before.dataClass !== after.dataClass) note('data-class', 'safe')
  const options = new Set((after.options ?? []).map(o => o.id))
  if ((before.options ?? []).some(o => !options.has(o.id))) note('option-removed', 'caution')
  else if (!same(before.options, after.options)) note('options', 'safe')
  if (!same(before.required, after.required)) note('required', after.required === false || after.required === undefined ? 'safe' : 'caution')
  if (!same(before.visibleWhen, after.visibleWhen)) note('condition', 'caution')
  if (!same(before.validation, after.validation)) note('validation', (after.validation ?? []).length ? 'caution' : 'safe')
  if (!same([before.allowOther, before.multiple, before.scale, before.source], [after.allowOther, after.multiple, after.scale, after.source])) note('set-up', 'caution')
  return { what, impact: worst(impacts) }
}

/**
 * Reads the draft and works out everything Publish needs: the problems, what the specification
 * refuses, what changed since the live version and how much it matters. Writes nothing.
 */
export async function planPublish(form: FormRow, draft: DraftRow): Promise<PublishPlan> {
  const definition = await parseOrRefuse(JSON.parse(draft.definition))
  const problems = checkDefinition(definition, { allowRegex: await useSetting('forms.builder.free-patterns') as boolean })
  const [fields, live] = await Promise.all([getFields(form.id), getVersion(form.liveVersionId)])
  const known = new Map(fields.map(f => [f.questionId, f]))
  const keys = new Map(fields.map(f => [f.key, f.questionId]))
  const before = new Map(live ? questionsOf(JSON.parse(live.definition) as Definition).map(q => [q.question.id, q.question]) : [])
  const now = questionsOf(definition).map(q => q.question)
  const refusals: PublishPlan['refusals'] = []
  const changes: Change[] = []

  for (const q of now) {
    const field = known.get(q.id)
    const holder = keys.get(q.key)
    if (holder !== undefined && holder !== q.id)
      refusals.push({ code: 'forms.publish.key-taken', questionId: q.id, reason: `"${q.label}" uses the export name ${q.key}, which another question of this form has used. Give it a different one.` })
    if (!field) {
      const required = q.required !== undefined && q.required !== false
      changes.push({ kind: 'added', impact: live && required ? 'caution' : 'safe', questionId: q.id, label: q.label, what: required ? ['required'] : [] })
      continue
    }
    if (field.type !== q.type)
      refusals.push({ code: 'forms.publish.type-changed', questionId: q.id, reason: `"${q.label}" was published as a different type of question, and a question's type never changes. Remove it and add a new question instead.` })
    if (DATA_CLASSES.indexOf(q.dataClass) < DATA_CLASSES.indexOf(field.dataClass))
      refusals.push({ code: 'forms.publish.class-lowered', questionId: q.id, reason: `"${q.label}" was published as ${field.dataClass}, and how sensitive a question's answers are can be raised but never lowered.` })
    const was = before.get(q.id)
    // A question retired earlier and put back: it joins this version as an added one.
    if (!was) changes.push({ kind: 'added', impact: 'safe', questionId: q.id, label: q.label, what: ['restored'] })
    else {
      const { what, impact } = questionChanges(was, q)
      if (what.length) changes.push({ kind: 'changed', impact, questionId: q.id, label: q.label, what })
    }
  }
  const present = new Set(now.map(q => q.id))
  for (const [id, q] of before) if (!present.has(id)) changes.push({ kind: 'retired', impact: 'breaking', questionId: id, label: q.label, what: [] })

  if (form.retentionDays === null && now.some(q => PERSONAL.includes(q.dataClass)) && await useSetting('forms.retention.require-choice'))
    refusals.push({ code: 'forms.publish.retention-needed', reason: 'This form asks for personal answers, so say how long they are kept before publishing it.' })

  const text = JSON.stringify(definition)
  const hash = await hashOf(text)
  // Order, pages, content and routes are not questions, so they count as a change without a line of their own.
  const unchanged = !!live && live.definitionHash === hash
  return { definition, problems, refusals, summary: { impact: worst(changes.map(c => c.impact)), changes }, number: (live?.number ?? 0) + 1, unchanged, hash, text }
}

/** Refuses a plan that may not be published, with the first reason. */
export function refuseUnpublishable(plan: PublishPlan, confirmed: boolean): void {
  if (!publishable(plan.problems)) {
    const errors = plan.problems.filter(p => p.level === 'error').length
    refuse('forms.publish.problems', errors === 1 ? 'This form has a problem that must be fixed before it is published.' : `This form has ${errors} problems that must be fixed before it is published.`, { status: 422, remedy: 'Open the problems list in the builder.' })
  }
  const refusal = plan.refusals[0]
  if (refusal) refuse(refusal.code, refusal.reason, { status: 422 })
  if (plan.unchanged) refuse('forms.publish.unchanged', 'Nothing has changed since this form was last published.', { status: 409 })
  if (plan.summary.impact === 'breaking' && !confirmed) {
    const retired = plan.summary.changes.filter(c => c.kind === 'retired').map(c => `"${c.label}"`)
    refuse('forms.publish.confirm-needed', `Publishing this removes ${retired.join(', ')}. Answers already given stay readable, but responses in progress lose them.`, { status: 409, remedy: 'Confirm the change to publish.' })
  }
}

/** Writes the version, moves the form to it and brings the field catalogue up to date, all in the caller's unit. */
export function writePublish(unit: UnitView, form: FormRow, draft: DraftRow, plan: PublishPlan, versionId: string, accountId: string, at: number): void {
  const stale = { code: 'forms.draft.stale', reason: 'The form changed while it was being published.', remedy: 'Look at the changes and publish again.' }
  // The draft being published is the one that was checked.
  unit.add({ sql: 'UPDATE forms_drafts SET edit_revision = edit_revision WHERE form_id = ? AND edit_revision = ?', params: [form.id, draft.editRevision] }).expect(1, stale)
  // The unique index on (form, number) refuses a second publish of the same number.
  unit.add({
    sql: 'INSERT OR IGNORE INTO forms_versions (id, form_id, number, definition, definition_hash, format, change_summary, published_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [versionId, form.id, plan.number, plan.text, plan.hash, plan.definition.format, JSON.stringify(plan.summary), accountId, at],
  }).expect(1, stale)
  unit.add({
    sql: 'UPDATE forms_forms SET live_version_id = ?, status = CASE status WHEN \'draft\' THEN \'live\' ELSE status END WHERE id = ? AND live_version_id IS ?',
    params: [versionId, form.id, form.liveVersionId],
  }).expect(1, stale)
  const present = questionsOf(plan.definition).map(q => q.question)
  for (const q of present) {
    unit.add({
      sql: `INSERT INTO forms_fields (form_id, question_id, key, type, data_class, label, first_version, retired_in_version) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
            ON CONFLICT (form_id, question_id) DO UPDATE SET key = excluded.key, data_class = excluded.data_class, label = excluded.label, retired_in_version = NULL`,
      params: [form.id, q.id, q.key, q.type, q.dataClass, q.label, plan.number],
    })
  }
  for (const c of plan.summary.changes) {
    if (c.kind === 'retired') unit.add({ sql: 'UPDATE forms_fields SET retired_in_version = ? WHERE form_id = ? AND question_id = ?', params: [plan.number, form.id, c.questionId] })
  }
}
