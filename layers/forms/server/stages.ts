// Moving a response between stages (form builder specification, part 3, "Workflow rules"; FB-403,
// FB-404). A response keeps the stages of the version it was sent on. Every move is decided here,
// on the server: it must be open from where the response is now, to this kind of mover, and nobody
// moves their own response. The move, its history row, the audit entry and the event commit
// together, and a second person making a move at the same moment is refused.
import { all, can, refuse, today, type Actor, type UnitView } from '#kit'
import type { Answers, Definition, Stage, Transition } from '../shared/engine'
import { evaluate, hasStages, isDecision, resubmitMove, staffMoves, stageOf, statusOf, workflowOf } from '../shared/engine'
import { answers as answersTable } from './db/schema'
import type { FormRow } from './forms'
import { closeRounds, conflicted, openRound } from './review'
import { answerRows, owns, recordMove, refuseInvalid, retentionFrom, type ResponseRow } from './responses'

const CONFLICT = 409 // not-policy: HTTP status

/** The stage a response is in, as its own version names it. A stage a later version removed still reads by its key. */
export function stageIn(def: Definition, response: { stageKey: string | null, stageKind: string | null }): Stage {
  return stageOf(def, response.stageKey) ?? { key: response.stageKey ?? '', name: response.stageKey ?? '', kind: (response.stageKind ?? 'closed') as Stage['kind'] }
}

const mayDecide = async (actor: Actor, formId: string) => (await can(actor, 'forms.response.decide', ['forms.form', formId])).allowed

/**
 * The moves staff may make on this response now. None on a form without stages, none on one's own
 * response or one they have a conflict on, and a decision only for somebody who may decide.
 */
export async function movesFor(def: Definition, response: ResponseRow, actor: Actor): Promise<Transition[]> {
  if (response.state !== 'submitted' || await owns(response, actor) || await conflicted(actor, response.id)) return []
  return staffMoves(def, response.stageKey, await mayDecide(actor, response.formId))
}

async function apply(unit: UnitView, input: { form: FormRow, response: ResponseRow, def: Definition, move: Transition, actorId: string | null, at: number, note: string | null, reason?: string | null, revision: number, calculated?: string | null, answers?: Answers }): Promise<Stage> {
  const to = stageOf(input.def, input.move.to)
  if (!to) return refuse('forms.stage.unknown', 'This move leads to a stage the form does not have.', { status: CONFLICT })
  const resend = input.revision !== input.response.currentRevision
  // A decision is dated and keeps its reason; any other move clears both, so they always speak of where the response is now.
  const decision = isDecision(input.def, input.move)
  unit.add({
    sql: `UPDATE forms_responses SET stage_key = ?2, stage_kind = ?3, stage_note = ?4, current_revision = ?5, updated_at = ?6, retention_due_at = ?7, decided_at = ?10, decision_reason = ?11${resend ? ', calculated = ?12' : ''} WHERE id = ?1 AND state = 'submitted' AND stage_key IS ?8 AND current_revision = ?9`, // not-policy: numbered parameters
    params: [input.response.id, to.key, to.kind, input.note, input.revision, input.at, retentionFrom(input.form, to.kind, input.at), input.response.stageKey, input.response.currentRevision, decision ? input.at : null, decision ? input.reason ?? null : null, ...(resend ? [input.calculated ?? null] : [])],
  }).expect(1, { code: 'forms.stage.moved', reason: 'This response has just been moved by somebody else.', remedy: 'Open it again to see where it is now.' })
  recordMove(unit, { responseId: input.response.id, from: input.response.stageKey, to, transitionKey: input.move.key, revision: input.revision, actorId: input.actorId, at: input.at })
  if (stageOf(input.def, input.response.stageKey)?.review) closeRounds(unit, input.response.id, input.at)
  await openRound(unit, { def: input.def, stage: to, formId: input.form.id, responseId: input.response.id, personId: input.response.personId, revision: input.revision, at: input.at, answers: input.answers })
  unit.audit({ action: 'state', record: ['forms.response', input.response.id], detail: { formId: input.form.id, from: input.response.stageKey, to: to.key, move: input.move.key, ...(decision ? { decision: to.kind } : {}) } })
  unit.announce('forms.response.moved', { responseId: input.response.id, formId: input.form.id, kind: to.kind, revision: input.revision }, { record: ['forms.response', input.response.id] })
  return to
}

/**
 * A move by staff (FB-403). `note` is what the person who sent the response is told with it. A move
 * to an approved or declined stage is a decision (FB-407): it needs the ability to decide, and its
 * `reason` is kept for the record and never sent to the person.
 */
export async function moveResponse(unit: UnitView, input: { form: FormRow, response: ResponseRow, def: Definition, transitionKey: string, actor: Actor, note: string | null, reason?: string | null, at: number }): Promise<Stage> {
  if (input.response.state !== 'submitted') return refuse('forms.stage.not-open', 'This response cannot be moved.', { status: CONFLICT })
  if (await owns(input.response, input.actor)) return refuse('forms.stage.own-response', 'You cannot move your own response.', { status: 403, remedy: 'Ask somebody else who looks after this form.' }) // not-policy: HTTP status
  if (await conflicted(input.actor, input.response.id)) return refuse('forms.review.conflicted', 'You have a conflict of interest on this response, so you cannot move it.', { status: 403 }) // not-policy: HTTP status
  const move = staffMoves(input.def, input.response.stageKey, true).find(t => t.key === input.transitionKey)
  if (!move) return refuse('forms.stage.not-open', 'This move is not open from where the response is now.', { status: CONFLICT, remedy: 'Open the response again to see where it is now.' })
  if (isDecision(input.def, move)) {
    if (!await mayDecide(input.actor, input.form.id)) return refuse('forms.decision.not-allowed', 'You cannot make this decision.', { status: 403, remedy: 'Ask somebody who decides on this form.' }) // not-policy: HTTP status
    if (move.needsReason && !input.reason?.trim()) return refuse('forms.decision.no-reason', 'Give a reason for the record.', { status: 422, fields: { reason: 'forms.decision.no-reason' } }) // not-policy: HTTP status
  }
  return apply(unit, { form: input.form, response: input.response, def: input.def, move, actorId: input.actor.accountId ?? null, at: input.at, note: input.note, reason: input.reason?.trim() || null, revision: input.response.currentRevision })
}

/**
 * The person sends their changes back (FB-404): the answers are checked as a first send is, kept
 * as a new revision beside the earlier ones, and the response takes the move open to them.
 */
export async function resubmit(unit: UnitView, input: { form: FormRow, response: ResponseRow, def: Definition, actor: Actor, answers: Answers, at: number }): Promise<Stage> {
  const move = input.response.state === 'submitted' ? resubmitMove(input.def, input.response.stageKey) : undefined
  if (!move) return refuse('forms.response.not-returned', 'This response is not open for changes.', { status: CONFLICT })
  const evaluation = evaluate(input.def, input.answers, { today: await today() })
  refuseInvalid(evaluation)
  const revision = input.response.currentRevision + 1
  const calculated = Object.keys(evaluation.calculated).length ? JSON.stringify(evaluation.calculated) : null
  const to = await apply(unit, { form: input.form, response: input.response, def: input.def, move, actorId: input.actor.accountId ?? null, at: input.at, note: null, revision, calculated, answers: evaluation.answers })
  const rows = await answerRows(input.def, evaluation.answers, input.response.id, revision)
  if (rows.length) unit.insertSet(answersTable, rows as unknown as Record<string, unknown>[])
  return to
}

export interface HistoryEntry { at: number, from: string | null, to: string, toKind: string, move: string, revision: number, by: string | null }

/** A response's moves, oldest first, with the stage names of its own version. */
export async function historyOf(def: Definition, responseId: string): Promise<HistoryEntry[]> {
  const rows = await all<{ at: number, fromStage: string | null, toStage: string, toKind: string, transitionKey: string, revision: number, name: string | null }>(
    `SELECT h.at, h.from_stage AS fromStage, h.to_stage AS toStage, h.to_kind AS toKind, h.transition_key AS transitionKey, h.revision, a.name
     FROM forms_stage_history h LEFT JOIN core_accounts a ON a.id = h.actor_id WHERE h.response_id = ? ORDER BY h.at, h.id`, responseId)
  const name = (key: string | null) => key === null ? null : stageOf(def, key)?.name || key
  const label = (key: string) => workflowOf(def).transitions.find(t => t.key === key)?.label ?? key
  return rows.map(r => ({ at: r.at, from: name(r.fromStage), to: name(r.toStage)!, toKind: r.toKind, move: label(r.transitionKey), revision: r.revision, by: r.name }))
}

/** Which questions' answers differ between a revision and the one before it. A sealed answer counts only when it appears or goes. */
export async function changedIn(responseId: string, revision: number): Promise<string[]> {
  if (revision < 2) return []
  const rows = await all<{ revision: number, questionId: string, held: string }>(
    `SELECT revision, question_id AS questionId, json_group_array(json_array(repeat_index, value_text, value_number, value_json, other_text, value_cipher IS NOT NULL)) AS held
     FROM (SELECT * FROM forms_answers WHERE response_id = ?1 AND revision IN (?2, ?2 - 1) ORDER BY repeat_index) GROUP BY revision, question_id`, responseId, revision)
  const now = new Map(rows.filter(r => r.revision === revision).map(r => [r.questionId, r.held]))
  const before = new Map(rows.filter(r => r.revision !== revision).map(r => [r.questionId, r.held]))
  return [...new Set([...now.keys(), ...before.keys()])].filter(id => now.get(id) !== before.get(id)).sort()
}

/** What a person is shown about where their own response is. */
export function ownStatus(def: Definition, response: ResponseRow): { status: string, kind: string, note: string | null, canChange: boolean } | null {
  if (!hasStages(def) || response.state !== 'submitted') return null
  const stage = stageIn(def, response)
  return { status: statusOf(stage), kind: stage.kind, note: response.stageNote, canChange: !!resubmitMove(def, response.stageKey) }
}
