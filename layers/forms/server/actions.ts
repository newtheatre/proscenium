// Outcome actions (forms.outcome-action; FB-506): what other modules do once a response has taken
// a move. A move that carries actions writes one run for each in its own unit of work, and queues
// the job that runs it; the job's unit holds the action's own statements and the mark that the run
// is done, so they commit together or not at all and an action's writes happen exactly once. A run
// whose job has given up stays waiting, and somebody who decides on the form can run it again.
import { all, first, newId, refuse, usePoint, type UnitView } from '#kit'
import type { ActionUse, Definition, Transition } from '../shared/engine'
import { questionsOf } from '../shared/engine'
import { getVersion } from './versions'
import type { ActionAnswer, ActionPreview, OutcomeAction } from './points/outcome-action'
import { getResponse, readAnswers, words, type ResponseRow } from './responses'

export async function actions(): Promise<OutcomeAction[]> {
  return (await usePoint<OutcomeAction>('forms.outcome-action')).map(c => c.value).filter(a => !!a?.key)
}

/** The actions as the builder and the publish check need them: what each asks for, and nothing that runs. */
export async function actionList() {
  return (await actions()).map(a => ({ key: a.key, label: a.label, slot: a.slot ?? null, inputs: a.inputs.map(i => ({ key: i.key, label: i.label, required: !!i.required, ...(i.types ? { types: i.types } : {}) })) }))
}

/** Writes a run for each action on a move, and queues it, in the move's own unit. */
export function queueActions(unit: UnitView, input: { response: ResponseRow, move: Transition, revision: number, actorId: string | null, at: number }): void {
  for (const use of input.move.actions ?? []) queue(unit, { id: newId('frun'), responseId: input.response.id, formId: input.response.formId, moveKey: input.move.key, use, revision: input.revision, actorId: input.actorId, at: input.at })
}

function queue(unit: UnitView, run: { id: string, responseId: string, formId: string, moveKey: string, use: ActionUse, revision: number, actorId: string | null, at: number }): void {
  const jobId = unit.enqueue('forms.run-action', { runId: run.id })
  unit.add({
    sql: 'INSERT INTO forms_action_runs (id, response_id, form_id, move_key, use_id, action_key, map, revision, actor_id, state, job_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, \'waiting\', ?, ?)',
    params: [run.id, run.responseId, run.formId, run.moveKey, run.use.id, run.use.action, JSON.stringify(run.use.map), run.revision, run.actorId, jobId, run.at],
  }).expect(1)
}

interface RunRow { id: string, responseId: string, formId: string, moveKey: string, useId: string, actionKey: string, map: string, revision: number, actorId: string | null, state: 'waiting' | 'done' | 'skipped', jobId: string | null, createdAt: number }
const RUN = 'id, response_id AS responseId, form_id AS formId, move_key AS moveKey, use_id AS useId, action_key AS actionKey, map, revision, actor_id AS actorId, state, job_id AS jobId, created_at AS createdAt'

const finish = (unit: UnitView, runId: string, state: 'done' | 'skipped', detail: string | null, at: number, record?: [string, string]) =>
  unit.add({ sql: 'UPDATE forms_action_runs SET state = ?, detail = ?, finished_at = ?, record_type = ?, record_id = ? WHERE id = ? AND state = \'waiting\'', params: [state, detail, at, record?.[0] ?? null, record?.[1] ?? null, runId] })
    .expect(1, { code: 'forms.action.ran', reason: 'This action has already run.' })

/** The answers a run's map names, as the response stood at the revision the move was made on. */
async function inputsOf(def: Definition, run: { responseId: string, map: string, revision: number }): Promise<Record<string, ActionAnswer | undefined>> {
  const types = new Map(questionsOf(def).map(({ question }) => [question.id, question.type]))
  const stored = (await readAnswers([run.responseId], types, false, run.revision)).get(run.responseId) ?? []
  const out: Record<string, ActionAnswer | undefined> = {}
  for (const [key, questionId] of Object.entries(JSON.parse(run.map) as Record<string, string>)) {
    const answer = stored.find(a => a.questionId === questionId && a.repeatIndex === 0 && !a.restricted)
    if (answer && answer.value !== null && answer.value !== undefined && answer.value !== '') out[key] = { value: answer.value, text: words(answer, types.get(questionId)) }
  }
  return out
}

/**
 * Runs one action, in the job's unit. Safe to call any number of times: a run that is no longer
 * waiting does nothing. An action whose module is switched off refuses, so the run waits.
 */
export async function runAction(unit: UnitView, runId: string, at: number): Promise<void> {
  const run = await first<RunRow>(`SELECT ${RUN} FROM forms_action_runs WHERE id = ?`, runId)
  if (!run || run.state !== 'waiting') return
  const response = (await getResponse(run.responseId))!
  const action = (await actions()).find(a => a.key === run.actionKey)
  if (!action) return refuse('forms.action.unavailable', 'This action is not available now: the module it belongs to is switched off.', { status: 409 }) // not-policy: HTTP status
  if (action.slot) {
    const place = await first<{ slotKey: string }>('SELECT slot_key AS slotKey FROM forms_placements WHERE id = ?', response.placementId)
    if (place?.slotKey !== action.slot) return void finish(unit, run.id, 'skipped', 'slot', at)
  }
  const def = JSON.parse((await getVersion(response.versionId))!.definition) as Definition
  const result = await action.run(unit, {
    runId: run.id,
    input: await inputsOf(def, run),
    response: { id: response.id, reference: response.reference, formId: response.formId, personId: response.personId, subjectType: response.subjectType, subjectId: response.subjectId, decidedAt: response.decidedAt, decisionReason: response.decisionReason },
    actorId: run.actorId,
    at: run.createdAt,
  })
  // An action that can never do what was asked says why, and the run ends there as not done.
  if (result && 'skipped' in result && result.skipped) return void finish(unit, run.id, 'skipped', result.skipped.slice(0, 500), at) // not-policy: the bound on the reason
  finish(unit, run.id, 'done', null, at, result && 'record' in result ? result.record : undefined)
  unit.audit({ action: 'update', record: ['forms.response', response.id], detail: { formId: response.formId, ran: run.actionKey } })
}

export interface MovePreview extends Partial<ActionPreview> { action: string, label: string, skipped?: 'slot' }

/**
 * What a move's actions would do with a response as it stands, for whoever is about to make it. An
 * action that says nothing of itself is left out; one that runs only in another slot says so.
 */
export async function previewMove(response: ResponseRow, def: Definition, move: Transition, actorId: string | null, at: number): Promise<MovePreview[]> {
  const known = await actions()
  const out: MovePreview[] = []
  for (const use of move.actions ?? []) {
    const action = known.find(a => a.key === use.action)
    if (!action) continue
    if (action.slot) {
      const place = await first<{ slotKey: string }>('SELECT slot_key AS slotKey FROM forms_placements WHERE id = ?', response.placementId)
      if (place?.slotKey !== action.slot) {
        out.push({ action: action.key, label: action.label, skipped: 'slot' })
        continue
      }
    }
    const said = await action.preview?.({
      input: await inputsOf(def, { responseId: response.id, map: JSON.stringify(use.map), revision: response.currentRevision }),
      response: { id: response.id, reference: response.reference, formId: response.formId, personId: response.personId, subjectType: response.subjectType, subjectId: response.subjectId, decidedAt: response.decidedAt, decisionReason: response.decisionReason },
      actorId,
      at,
    })
    if (said) out.push({ action: action.key, label: action.label, lines: said.lines, warnings: said.warnings, blocked: said.blocked })
  }
  return out
}

export interface RunView { id: string, action: string, label: string | null, state: 'waiting' | 'done' | 'skipped' | 'failed', detail: string | null, at: number, finishedAt: number | null, record: { type: string, id: string, title: string, to?: string } | null }

/** What has been asked of other modules for this response, oldest first. A run whose job has given up reads as failed, with why. */
export async function runsOf(responseId: string): Promise<RunView[]> {
  const rows = await all<{ id: string, action: string, state: 'waiting' | 'done' | 'skipped', detail: string | null, at: number, finishedAt: number | null, job: string | null, error: string | null, recordType: string | null, recordId: string | null }>(
    `SELECT r.id, r.action_key AS action, r.state, r.detail, r.created_at AS at, r.finished_at AS finishedAt, j.state AS job, j.last_error AS error, r.record_type AS recordType, r.record_id AS recordId
     FROM forms_action_runs r LEFT JOIN core_jobs j ON j.id = r.job_id WHERE r.response_id = ? ORDER BY r.created_at, r.id`, responseId)
  const known = new Map((await actions()).map(a => [a.key, a.label]))
  // What an action made is shown as its own module names it; a type nobody resolves now is not linked.
  const resolvers = await usePoint<{ resolve: (id: string) => Promise<{ title: string, to?: string } | null> }>('core.record-resolver')
  const out: RunView[] = []
  for (const r of rows) {
    const failed = r.state === 'waiting' && (r.job === 'dead' || r.job === null)
    const made = r.recordType && r.recordId ? await resolvers.find(c => c.id === r.recordType)?.value.resolve(r.recordId) : null
    out.push({ id: r.id, action: r.action, label: known.get(r.action) ?? null, state: failed ? 'failed' : r.state, detail: failed ? r.error : r.detail, at: r.at, finishedAt: r.finishedAt, record: made ? { type: r.recordType!, id: r.recordId!, title: made.title, to: made.to } : null })
  }
  return out
}

/** Queues a run again after its job gave up. Refused while the first job may still run, so an action is never queued twice. */
export async function runAgain(unit: UnitView, responseId: string, runId: string): Promise<void> {
  const run = await first<{ id: string, state: string, job: string | null }>(
    'SELECT r.id, r.state, j.state AS job FROM forms_action_runs r LEFT JOIN core_jobs j ON j.id = r.job_id WHERE r.id = ? AND r.response_id = ?', runId, responseId)
  if (!run) return refuse('forms.action.not-found', 'There is no such action here.', { status: 404 }) // not-policy: HTTP status
  if (run.state !== 'waiting' || (run.job !== 'dead' && run.job !== null)) return refuse('forms.action.not-failed', 'This action is not waiting to be run again.', { status: 409 }) // not-policy: HTTP status
  const jobId = unit.enqueue('forms.run-action', { runId: run.id })
  unit.add({ sql: 'UPDATE forms_action_runs SET job_id = ?1 WHERE id = ?2 AND state = \'waiting\'', params: [jobId, run.id] }).expect(1, { code: 'forms.action.ran', reason: 'This action has already run.' })
}
