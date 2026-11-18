// Custom fields (FB-503): a form in record mode, attached to a slot for every record of its type
// and filled in on each record's page. It has the simple life the specification gives it: one
// response per record, made on the first save, received and closed throughout, and every save a
// new revision. Who may fill it in is the host module's own ability on that record.
import { all, first, newId, refuse, requireAbility, today, type Actor, type UnitView } from '#kit'
import { evaluate, firstStage, questionsOf, SUBMIT, type Answers, type Definition } from '../shared/engine'
import { answers as answersTable } from './db/schema'
import { answerRows, newReference, readAnswers, recordMove, refuseInvalid, toAnswers } from './responses'
import { EVERY, modeOf, type FormsSlot } from './slots'

export interface RecordFields {
  formId: string
  title: string
  placementId: string
  versionId: string
  version: number
  definition: Definition
  /** The response that holds this record's answers, once there has been a first save. */
  responseId: string | null
  /** How many times it has been saved. A save states the number it was made from. */
  revision: number
  answers: Answers
  updatedAt: number | null
}

const key = (recordId: string) => `record:${recordId}`

/** Refuses unless the slot holds custom fields and this person may fill them in on this record. */
export async function mayEdit(actor: Actor, slot: FormsSlot, recordId: string): Promise<void> {
  if (modeOf(slot) !== 'record' || !slot.edit || recordId === EVERY) refuse('forms.slot.not-found', 'There are no custom fields here.', { status: 404 }) // not-policy: HTTP status
  await requireAbility(actor, slot.edit as never, [slot.subject, recordId])
}

/** The sets of custom fields a record has, in the order they were attached, each with the record's answers. */
export async function fieldsOf(slot: FormsSlot, recordId: string): Promise<RecordFields[]> {
  const sets = await all<{ formId: string, title: string, placementId: string, versionId: string, version: number, definition: string }>(
    `SELECT f.id AS formId, f.title, p.id AS placementId, v.id AS versionId, v.number AS version, v.definition
     FROM forms_placements p JOIN forms_forms f ON f.id = p.form_id AND f.mode = 'record' AND f.status <> 'archived' JOIN forms_versions v ON v.id = f.live_version_id
     WHERE p.slot_key = ? AND p.subject_type = ? AND p.subject_id = ? AND p.status = 'active' ORDER BY p.created_at, p.id`, slot.id, slot.subject, EVERY)
  const out: RecordFields[] = []
  for (const set of sets) {
    const definition = JSON.parse(set.definition) as Definition
    const response = await first<{ id: string, revision: number, updatedAt: number }>('SELECT id, current_revision AS revision, updated_at AS updatedAt FROM forms_responses WHERE placement_id = ? AND unique_key = ?', set.placementId, key(recordId))
    // Answers are kept by question, so those given on an earlier version of the fields still read on this one.
    const stored = response ? (await readAnswers([response.id], new Map(questionsOf(definition).map(q => [q.question.id, q.question.type])), false)).get(response.id)! : []
    out.push({ ...set, definition, responseId: response?.id ?? null, revision: response?.revision ?? 0, answers: toAnswers(definition, stored), updatedAt: response?.updatedAt ?? null })
  }
  return out
}

const STALE = { code: 'forms.record.stale', reason: 'These fields were saved by somebody else after you opened them.', remedy: 'Reload to see their changes, then make yours again.' }

/** Saves one set of a record's custom fields as a new revision, checked as any answers are. */
export async function saveFields(unit: UnitView, input: { slot: FormsSlot, recordId: string, fields: RecordFields, answers: Answers, revision: number, actor: Actor, at: number }): Promise<{ revision: number }> {
  const { fields, slot } = input
  if (input.revision !== fields.revision) return refuse(STALE.code, STALE.reason, { status: 409, remedy: STALE.remedy }) // not-policy: HTTP status
  const evaluation = evaluate(fields.definition, input.answers, { today: await today() })
  refuseInvalid(evaluation)
  const calculated = Object.keys(evaluation.calculated).length ? JSON.stringify(evaluation.calculated) : null
  const revision = fields.revision + 1
  const responseId = fields.responseId ?? newId('fres')
  const by = input.actor.accountId ?? null
  if (fields.responseId) {
    unit.add({
      sql: 'UPDATE forms_responses SET current_revision = ?, version_id = ?, calculated = ?, entered_by = ?, updated_at = ? WHERE id = ? AND current_revision = ?',
      params: [revision, fields.versionId, calculated, by, input.at, responseId, fields.revision],
    }).expect(1, STALE)
  }
  else {
    const stage = firstStage(fields.definition)
    // One response per record and set of fields, held by the unique key: of two first saves at once, one is told.
    unit.add({
      sql: 'INSERT OR IGNORE INTO forms_responses (id, placement_id, unique_key, reference, form_id, version_id, realm, entered_by, state, stage_key, stage_kind, current_revision, calculated, is_test, submitted_at, created_at, updated_at, subject_type, subject_id) VALUES (?, ?, ?, ?, ?, ?, \'members\', ?, \'submitted\', ?, ?, 1, ?, 0, ?, ?, ?, ?, ?)',
      params: [responseId, fields.placementId, key(input.recordId), newReference(), fields.formId, fields.versionId, by, stage.key, stage.kind, calculated, input.at, input.at, input.at, slot.subject, input.recordId],
    }).expect(1, STALE)
    unit.add({ sql: 'UPDATE forms_placements SET response_count = response_count + 1 WHERE id = ?', params: [fields.placementId] })
    recordMove(unit, { responseId, from: null, to: stage, transitionKey: SUBMIT, revision: 1, actorId: by, at: input.at })
  }
  const rows = await answerRows(fields.definition, evaluation.answers, responseId, revision)
  if (rows.length) unit.insertSet(answersTable, rows as unknown as Record<string, unknown>[])
  unit.audit({ action: fields.responseId ? 'update' : 'create', record: ['forms.response', responseId], detail: { formId: fields.formId, slot: slot.id, subject: input.recordId, revision } })
  return { revision }
}
