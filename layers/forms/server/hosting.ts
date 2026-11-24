// What a host module may do with forms in its own pages (form builder specification, part 4,
// "Services forms offers"): read the forms attached to one of its records in a slot and send a
// response to one in its own unit of work; read the custom fields of its records for its lists and
// exports; and say that a record is gone, so its custom fields go with it. Exported to other modules
// from services.ts. Forms checks nothing of the host's: the host has already decided, with its own
// abilities, that this person may see its record. Forms keeps its own rules: who may answer, when,
// how often, the engine on every answer, data classes, the cap, the audit entry and the event.
import { all, first, newId, nowMs, refuse, today, type Actor, type UnitView } from '#kit'
import { ERASED } from '#kit/db'
import type { Answers, DataClass, Definition, QuestionType, Value, Marked } from '../shared/engine'
import { hasAnswerKey, publicDefinition, questionsOf, withoutWorkflow } from '../shared/engine'
import { VERSION, getForm, getVersion, type VersionRow } from './forms'
import { PLACE, draftOf, readAnswers, sendResponse, shut, words, type LinkRow, type Shut, type StoredPlace } from './responses'
import { EVERY, attachedTo, modeOf, slotOf, type FormsSlot } from './slots'

async function slotIn(slotId: string, mode: 'submission' | 'record'): Promise<FormsSlot> {
  const slot = await slotOf(slotId)
  if (!slot || modeOf(slot) !== mode) return refuse('forms.slot.not-found', 'A form cannot be attached here.', { status: 404 }) // not-policy: HTTP status
  return slot
}

// ---- forms a person answers inside the host's page ----

export interface SlotForm {
  formId: string
  /** The place it is attached: what addResponse is told, with the form. */
  placementId: string
  title: string
  anonymous: boolean
  /** `open`, or why this person cannot answer it now (the same reasons the form's own page gives). */
  state: 'open' | Shut
  /** The published definition without its stages, which name reviewers. Null unless open. */
  definition: Definition | null
  version: number
  /** Whether somebody signed out must give an email address. */
  asksEmail: boolean
  /** This person's unsent working copy, if they keep one there. */
  draft: { responseId: string, answers: Answers } | null
}

/**
 * The published forms attached to one record in a submission slot, in the order they were
 * attached, each with whether this person can answer it now. A form not yet published, archived or
 * taken away is left out. Writes nothing.
 */
export async function slotForms(slotId: string, subjectId: string, actor: Actor): Promise<{ today: string, forms: SlotForm[] }> {
  const slot = await slotIn(slotId, 'submission')
  const at = nowMs()
  const out: SlotForm[] = []
  for (const place of await attachedTo(slot.id, subjectId)) {
    const form = await getForm(place.formId)
    const version = form ? await getVersion(form.liveVersionId) : null
    if (!form || !version || form.status === 'draft' || form.status === 'archived') continue
    const why = await shut(form, place, actor, at)
    const draft = why ? null : await draftOf(place, actor)
    out.push({
      formId: form.id,
      placementId: place.id,
      title: form.title,
      anonymous: form.anonymous,
      state: why ?? 'open',
      definition: why ? null : publicDefinition(withoutWorkflow(JSON.parse(version.definition) as Definition)),
      version: version.number,
      asksEmail: !form.anonymous && !actor.accountId,
      draft: draft ? { responseId: draft.response.id, answers: draft.answers } : null,
    })
  }
  return { today: await today(), forms: out }
}

/**
 * Whether a published form attached to one record in a submission slot decides its responses: its
 * live version has an approved stage. A host that waits on a decision (membership approval, say)
 * asks this before it lets the record open. Writes nothing.
 */
export async function slotDecides(slotId: string, subjectId: string): Promise<boolean> {
  const slot = await slotIn(slotId, 'submission')
  for (const place of await attachedTo(slot.id, subjectId)) {
    const form = await getForm(place.formId)
    const version = form ? await getVersion(form.liveVersionId) : null
    if (!form || !version || form.status === 'draft' || form.status === 'archived') continue
    const definition = JSON.parse(version.definition) as Definition
    if (definition.workflow?.stages.some(s => s.kind === 'approved')) return true
  }
  return false
}

/**
 * Sends a response to a form attached to the host's record, in the host's unit of work, with every
 * check POST /api/forms/open/:slug/responses makes: the engine runs again on the answers, hidden
 * answers are dropped, what is wrong is refused by path, the place's dates, cap and one each hold,
 * special-category answers are sealed, and the audit entry, the receipt and forms.response.submitted
 * go in the same unit. Give `responseId` (a `fres_` id made before the first try) so a retry stores
 * one response; one is made when left out. Never commits.
 */
export async function addResponse(unit: UnitView, input: { slot: string, subject: string, formId: string, actor: Actor, answers: Answers, email?: string | null, responseId?: string, versionId?: string }): Promise<{ responseId: string, reference: string, marking?: Marked }> {
  const slot = await slotIn(input.slot, 'submission')
  const row = await first<StoredPlace>(`SELECT ${PLACE} FROM forms_placements WHERE slot_key = ? AND subject_type = ? AND subject_id = ? AND form_id = ? AND status <> 'ended'`, slot.id, slot.subject, input.subject, input.formId)
  const form = row ? await getForm(row.formId) : null
  if (!row || !form || form.status === 'draft' || form.status === 'archived') return refuse('forms.form.not-found', 'There is no form here.', { status: 404 }) // not-policy: HTTP status
  // A host may pin the version its person was shown, such as a quiz begun before a new version was published.
  const version = input.versionId === undefined ? await getVersion(form.liveVersionId) : await versionOf(form.id, input.versionId)
  if (!version) return refuse(input.versionId === undefined ? 'forms.form.not-found' : 'forms.version-not-of-form', input.versionId === undefined ? 'There is no form here.' : 'That version is not one of this form\'s.', { status: 404 }) // not-policy: HTTP status
  if (input.responseId !== undefined && !/^fres_[0-9A-Za-z]{26}$/.test(input.responseId)) return refuse('forms.response.not-found', 'There is no response here.', { status: 404 }) // not-policy: HTTP status; an id is its prefix and 26 characters
  const link: LinkRow = { ...row, onePerPerson: !!row.onePerPerson }
  const sent = await sendResponse(unit, { form, version, link, actor: input.actor, responseId: input.responseId ?? newId('fres'), answers: input.answers, email: input.email?.trim().toLowerCase() || null, at: nowMs() })
  return { responseId: sent.responseId, reference: sent.reference, ...(sent.marking ? { marking: sent.marking } : {}) }
}

/** A published version of a form, by id; null for a version of another form. */
const versionOf = (formId: string, versionId: string) => first<VersionRow>(`SELECT ${VERSION} FROM forms_versions WHERE id = ? AND form_id = ?`, versionId, formId)

/** One published version of the form on a placement, as its person may be sent it: without the correct answers or the stages. */
export async function slotFormVersion(placementId: string, versionId: string): Promise<{ version: number, definition: Definition }> {
  const place = await first<{ formId: string }>('SELECT form_id AS formId FROM forms_placements WHERE id = ?', placementId)
  const version = place ? await versionOf(place.formId, versionId) : null
  if (!version) return refuse('forms.version-not-of-form', 'That version is not one of this form\'s.', { status: 404 }) // not-policy: HTTP status
  return { version: version.number, definition: publicDefinition(withoutWorkflow(JSON.parse(version.definition) as Definition)) }
}

/**
 * A form attached to the host's record in a slot, as a quiz: its placement, its live version, and
 * whether that version is marked (correct answers and a pass mark), so a host can pin it (FB-513).
 */
export async function slotQuiz(slotId: string, subjectId: string, formId: string): Promise<{ placementId: string, versionId: string, marked: boolean } | null> {
  const slot = await slotIn(slotId, 'submission')
  const place = (await attachedTo(slot.id, subjectId)).find(p => p.formId === formId)
  const form = place ? await getForm(formId) : null
  const version = form && form.status !== 'draft' && form.status !== 'archived' ? await getVersion(form.liveVersionId) : null
  if (!place || !version) return null
  const def = JSON.parse(version.definition) as Definition
  return { placementId: place.id, versionId: version.id, marked: hasAnswerKey(def) && def.marking?.passMark !== undefined }
}

// ---- custom fields, for the host's lists and exports ----

export interface FieldColumn {
  /** What the host's list or export calls it: the question's export name, or `<form address>.<name>` where two sets share one. */
  name: string
  formId: string
  form: string
  questionId: string
  key: string
  label: string
  type: QuestionType
  dataClass: Exclude<DataClass, 'special'>
}

interface FieldSet { formId: string, slug: string, title: string, placementId: string, definition: string }
const fieldSets = (slot: FormsSlot) => all<FieldSet>(
  `SELECT f.id AS formId, f.slug, f.title, p.id AS placementId, v.definition
   FROM forms_placements p JOIN forms_forms f ON f.id = p.form_id AND f.mode = 'record' AND f.status <> 'archived' JOIN forms_versions v ON v.id = f.live_version_id
   WHERE p.slot_key = ? AND p.subject_type = ? AND p.subject_id = ? AND p.status = 'active' ORDER BY p.created_at, p.id`, slot.id, slot.subject, EVERY)

function columnsOf(sets: FieldSet[]): FieldColumn[] {
  const all = sets.flatMap(set => questionsOf(JSON.parse(set.definition) as Definition)
    // A special-category answer never leaves forms this way.
    .filter(({ question }) => question.dataClass !== 'special')
    .map(({ question }) => ({ name: question.key, formId: set.formId, form: set.title, slug: set.slug, questionId: question.id, key: question.key, label: question.label, type: question.type, dataClass: question.dataClass as FieldColumn['dataClass'] })))
  return all.map(({ slug, ...c }) => ({ ...c, name: all.filter(o => o.key === c.key).length > 1 ? `${slug}.${c.key}` : c.key }))
}

/** The questions of the custom fields attached in a record-mode slot, as columns for a host's list or export. Special-category questions are left out. */
export async function recordFieldColumns(slotId: string): Promise<FieldColumn[]> {
  return columnsOf(await fieldSets(await slotIn(slotId, 'record')))
}

/** One record's answer to one question: as stored, and as words (a chosen record or option by its label). Entries of a repeating group are joined. */
export interface FieldValue { value: Value | Value[], text: string }

/**
 * The custom field values of some records, by record id and then by column name (recordFieldColumns).
 * A record nobody has filled in has an empty object. Special-category answers are never read.
 */
export async function recordFieldValues(slotId: string, recordIds: string[]): Promise<Record<string, Record<string, FieldValue>>> {
  const slot = await slotIn(slotId, 'record')
  const out: Record<string, Record<string, FieldValue>> = Object.fromEntries(recordIds.map(id => [id, {}]))
  const sets = await fieldSets(slot)
  if (!recordIds.length || !sets.length) return out
  const columns = columnsOf(sets)
  const responses = await all<{ id: string, formId: string, subjectId: string }>(
    'SELECT id, form_id AS formId, subject_id AS subjectId FROM forms_responses WHERE placement_id IN (SELECT value FROM json_each(?1)) AND unique_key IN (SELECT \'record:\' || value FROM json_each(?2)) AND state = \'submitted\'',
    JSON.stringify(sets.map(s => s.placementId)), JSON.stringify(recordIds))
  const types = new Map(columns.map(c => [c.questionId, c.type as string]))
  const answers = await readAnswers(responses.map(r => r.id), types, false)
  for (const response of responses) {
    const record = out[response.subjectId]
    if (!record) continue
    for (const column of columns.filter(c => c.formId === response.formId)) {
      const given = answers.get(response.id)!.filter(a => a.questionId === column.questionId && !a.restricted && a.dataClass !== 'special')
      if (!given.length) continue
      const text = given.map(a => words(a, column.type)).filter(Boolean).join(' | ')
      record[column.name] = { value: given.length === 1 && given[0]!.repeatIndex === 0 ? given[0]!.value : given.map(a => a.value), text }
    }
  }
  return out
}

/**
 * The host says a record is gone (erased or deleted): its custom fields in this slot go with it, in
 * the host's unit. Each set's response for the record is withdrawn, no longer belongs to the record
 * (a record of that id would start afresh) and leaves the set's count; its personal and free-text
 * answers are replaced by the erasure markers and special ones emptied, in every revision. Public
 * and internal answers stay as they are, as an erasure leaves them, since answers are kept
 * append-only. Safe to call twice: the second call finds nothing. Returns how many responses went.
 */
export async function eraseRecordFields(unit: UnitView, slotId: string, recordId: string): Promise<number> {
  const slot = await slotIn(slotId, 'record')
  const gone = await all<{ id: string, formId: string }>(
    `SELECT r.id, r.form_id AS formId FROM forms_responses r JOIN forms_placements p ON p.id = r.placement_id
     WHERE p.slot_key = ? AND r.subject_type = ? AND r.subject_id = ? AND r.unique_key = ? AND r.state = 'submitted'`, slot.id, slot.subject, recordId, `record:${recordId}`)
  if (!gone.length) return 0
  const ids = JSON.stringify(gone.map(r => r.id))
  const these = 'SELECT value FROM json_each(?1)'
  const erased = 'data_class IN (\'personal\', \'free-text\')'
  const cleared = (column: string) => `${column} = CASE WHEN ${erased} THEN NULL ELSE ${column} END`
  unit.add({
    sql: `UPDATE forms_answers SET value_text = CASE WHEN value_text IS NULL THEN NULL WHEN data_class = 'personal' THEN '${ERASED.anonymise}' WHEN data_class = 'free-text' THEN '${ERASED.redact}' ELSE value_text END, ${['value_number', 'value_json', 'other_text', 'label_snapshot'].map(cleared).join(', ')}, value_cipher = NULL WHERE (${erased} OR value_cipher IS NOT NULL) AND response_id IN (${these})`,
    params: [ids],
  })
  unit.add({
    sql: `UPDATE forms_placements SET response_count = response_count - (SELECT count(*) FROM forms_responses r WHERE r.placement_id = forms_placements.id AND r.id IN (${these}) AND r.state = 'submitted') WHERE id IN (SELECT placement_id FROM forms_responses WHERE id IN (${these}))`,
    params: [ids],
  })
  unit.add({ sql: `UPDATE forms_responses SET state = 'withdrawn', unique_key = NULL, calculated = NULL, score = NULL, passed = NULL, anonymised_at = ?2, updated_at = ?2 WHERE id IN (${these}) AND state = 'submitted'`, params: [ids, nowMs()] })
    .expect(gone.length, { code: 'forms.record.stale', reason: 'These fields changed while the record was being removed.', remedy: 'Try again.' })
  unit.audit(gone.map(r => ({ action: 'update' as const, record: ['forms.response', r.id] as [string, string], detail: { formId: r.formId, slot: slot.id, subject: recordId, withdrawn: 'record-gone' } })))
  return gone.length
}
