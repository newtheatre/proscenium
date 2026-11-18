// Review of a response (form builder specification, part 3, "Review rules"; FB-405 to FB-407, and
// change 1: a vote is a second kind of review). A stage may ask for review: each response that
// arrives opens a round with one assignment per reviewer. A reviewer sees only their own review
// until the round is released, and somebody with a conflict of interest is refused everything about
// that response, whatever else they hold.
import { all, first, newId, refuse, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { canonicalAccount, holdersOfRole } from '#modules/core'
import type { Answers, Definition, Entry, Review, ScoreSummary, Stage, Tally, Vote } from '../shared/engine'
import { questionsOf, stageOf, summarise, tally, validScores } from '../shared/engine'
import { reviewAssignments } from './db/schema'

const CONFLICT = 409 // not-policy: HTTP status
const FORBIDDEN = 403 // not-policy: HTTP status

/** The accounts asked to review at a stage now: the holders of its role and its named people, each once. */
export async function reviewersFor(review: Review): Promise<string[]> {
  const ids = new Set<string>()
  if (review.reviewers.role) for (const id of await holdersOfRole(review.reviewers.role)) ids.add(id)
  for (const id of review.reviewers.people ?? []) ids.add(await canonicalAccount(id))
  return [...ids].sort()
}

/**
 * Opens a round for a response arriving in a stage that asks for review: one assignment per
 * reviewer. The person who sent the response is assigned as conflicted, without declaring it.
 */
export async function openRound(unit: UnitView, input: { def: Definition, stage: Stage, formId: string, responseId: string, personId: string | null, revision: number, at: number, answers?: Answers }): Promise<void> {
  if (!input.stage.review) return
  const reviewers = await reviewersFor(input.stage.review)
  // Whoever sent it, and anybody named in a question of people marked as involved (FB-406).
  const barred = new Set<string>()
  if (input.personId) barred.add(await canonicalAccount(input.personId))
  const named = input.answers ? involvedIn(input.def, input.answers) : await involvedStored(input.def, input.responseId, input.revision)
  for (const id of named) barred.add(await canonicalAccount(id))
  const roundId = newId('frnd')
  unit.add({
    sql: 'INSERT INTO forms_review_rounds (id, response_id, form_id, stage_key, revision, opened_at) VALUES (?, ?, ?, ?, ?, ?)',
    params: [roundId, input.responseId, input.formId, input.stage.key, input.revision, input.at],
  })
  if (!reviewers.length) return
  unit.insertSet(reviewAssignments, reviewers.map(reviewerId => ({
    roundId, responseId: input.responseId, formId: input.formId, reviewerId,
    status: barred.has(reviewerId) ? 'conflicted' : 'assigned', conflict: barred.has(reviewerId) ? 'automatic' : null, createdAt: input.at,
  })))
}

const ids = (value: unknown): string[] => typeof value === 'string' && value ? [value] : Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
const involvedQuestions = (def: Definition) => questionsOf(def).filter(({ question: q }) => q.type === 'record' && q.peopleInvolved)

/** The accounts named in "people involved" questions, from answers in hand. */
export function involvedIn(def: Definition, answers: Answers): string[] {
  return involvedQuestions(def).flatMap(({ question: q, group }) => group
    ? (Array.isArray(answers[group.id]) ? answers[group.id] as Entry[] : []).flatMap(entry => ids(entry[q.id]))
    : ids(answers[q.id]))
}

/** The same, from a stored revision. A sealed answer names nobody here: it is not opened for this. */
async function involvedStored(def: Definition, responseId: string, revision: number): Promise<string[]> {
  const questions = involvedQuestions(def).map(({ question }) => question.id)
  if (!questions.length) return []
  const rows = await all<{ valueText: string | null, valueJson: string | null }>(
    'SELECT value_text AS valueText, value_json AS valueJson FROM forms_answers WHERE response_id = ? AND revision = ? AND question_id IN (SELECT value FROM json_each(?))', responseId, revision, JSON.stringify(questions))
  return rows.flatMap(r => r.valueText ? [r.valueText] : ids(r.valueJson ? JSON.parse(r.valueJson) : null))
}

/** Ends any round a response has open, as it leaves the stage. What was written stays for the record. */
export function closeRounds(unit: UnitView, responseId: string, at: number): void {
  unit.add({ sql: 'UPDATE forms_review_rounds SET closed_at = ? WHERE response_id = ? AND closed_at IS NULL', params: [at, responseId] })
}

/** Whether this person has a conflict of interest on a response, in any round. */
export async function conflicted(actor: Actor, responseId: string): Promise<boolean> {
  if (!actor.accountId) return false
  return !!await first(`SELECT 1 AS yes FROM forms_review_assignments WHERE response_id = ?2 AND status = 'conflicted' AND reviewer_id IN (${accountScopeSql('?1')}) LIMIT 1`, actor.accountId, responseId)
}

/** Refuses somebody with a conflict (FB-406): on every route that returns anything about the response. */
export async function refuseConflicted(actor: Actor, responseId: string): Promise<void> {
  if (await conflicted(actor, responseId)) refuse('forms.review.conflicted', 'You have a conflict of interest on this response, so you cannot see it.', { status: FORBIDDEN })
}

interface RoundRow { id: string, responseId: string, formId: string, stageKey: string, revision: number, openedAt: number, releasedAt: number | null, closedAt: number | null }
interface AssignmentRow { id: string, roundId: string, responseId: string, formId: string, reviewerId: string, status: 'assigned' | 'submitted' | 'conflicted', vote: Vote | null, scores: string | null, comment: string | null, submittedAt: number | null }
const ROUND = 'id, response_id AS responseId, form_id AS formId, stage_key AS stageKey, revision, opened_at AS openedAt, released_at AS releasedAt, closed_at AS closedAt'
const ASSIGNMENT = 'id, round_id AS roundId, response_id AS responseId, form_id AS formId, reviewer_id AS reviewerId, status, vote, scores, comment, submitted_at AS submittedAt'

/** A response's latest round: the open one, or the last to close. */
export const latestRound = (responseId: string) => first<RoundRow>(`SELECT ${ROUND} FROM forms_review_rounds WHERE response_id = ? ORDER BY opened_at DESC, id DESC LIMIT 1`, responseId)
const roundById = (id: string) => first<RoundRow>(`SELECT ${ROUND} FROM forms_review_rounds WHERE id = ?`, id)

/** The reviewer's own assignment, or a refusal: not found for anybody else's, and shut for a conflict. */
export async function ownAssignment(id: string, actor: Actor): Promise<{ assignment: AssignmentRow, round: RoundRow }> {
  const assignment = actor.accountId
    ? await first<AssignmentRow>(`SELECT ${ASSIGNMENT} FROM forms_review_assignments WHERE id = ?2 AND reviewer_id IN (${accountScopeSql('?1')})`, actor.accountId, id)
    : null
  if (!assignment) return refuse('forms.review.not-found', 'There is no review here.', { status: 404 }) // not-policy: HTTP status
  if (assignment.status === 'conflicted') return refuse('forms.review.conflicted', 'You have a conflict of interest on this response, so you cannot see it.', { status: FORBIDDEN })
  return { assignment, round: (await roundById(assignment.roundId))! }
}

export interface OwnReview { status: 'assigned' | 'submitted', vote: Vote | null, scores: Record<string, number>, comment: string, submittedAt: number | null }
export const ownReview = (a: AssignmentRow): OwnReview => ({ status: a.status as 'assigned' | 'submitted', vote: a.vote, scores: a.scores ? JSON.parse(a.scores) : {}, comment: a.comment ?? '', submittedAt: a.submittedAt })

/** A reviewer hands in their review, or changes it, while the round is open and not yet released. */
export function saveReview(unit: UnitView, input: { assignment: AssignmentRow, round: RoundRow, review: Review, vote?: Vote | null, scores?: Record<string, unknown>, comment: string | null, at: number }): void {
  if (input.round.closedAt !== null) return refuse('forms.review.closed', 'This response has moved on, so it can no longer be reviewed.', { status: CONFLICT })
  if (input.round.releasedAt !== null) return refuse('forms.review.released', 'The reviews have been released, so yours can no longer be changed.', { status: CONFLICT })
  const invalid = { status: 422 } // not-policy: HTTP status
  if (input.review.mode === 'vote') {
    if (!input.vote) return refuse('forms.review.no-vote', 'Choose for, against or abstain.', { ...invalid, fields: { vote: 'forms.review.no-vote' } })
  }
  else if (!validScores(input.review.criteria ?? [], input.scores ?? {})) {
    return refuse('forms.review.scores', 'Give a mark for each of the criteria.', { ...invalid, fields: { scores: 'forms.review.scores' } })
  }
  unit.add({
    sql: 'UPDATE forms_review_assignments SET status = \'submitted\', vote = ?2, scores = ?3, comment = ?4, submitted_at = ?5 WHERE id = ?1 AND status <> \'conflicted\' AND EXISTS (SELECT 1 FROM forms_review_rounds WHERE id = ?6 AND closed_at IS NULL AND released_at IS NULL)', // not-policy: numbered parameters
    params: [input.assignment.id, input.review.mode === 'vote' ? input.vote : null, input.review.mode === 'scores' ? JSON.stringify(input.scores) : null, input.comment, input.at, input.round.id],
  }).expect(1, { code: 'forms.review.closed', reason: 'This review can no longer be changed.' })
  unit.audit({ action: 'update', record: ['forms.response', input.assignment.responseId], detail: { formId: input.assignment.formId, review: input.assignment.id } })
}

/** A reviewer declares a conflict (FB-406): anything they wrote goes, and from now they are refused the response. */
export function declareConflict(unit: UnitView, assignment: AssignmentRow): void {
  unit.add({
    sql: 'UPDATE forms_review_assignments SET status = \'conflicted\', conflict = \'declared\', vote = NULL, scores = NULL, comment = NULL, submitted_at = NULL WHERE id = ? AND status <> \'conflicted\'',
    params: [assignment.id],
  }).expect(1, { code: 'forms.review.conflicted', reason: 'A conflict is already recorded.' })
  unit.audit({ action: 'state', record: ['forms.response', assignment.responseId], detail: { formId: assignment.formId, review: assignment.id, conflict: 'declared' } })
}

/** The chair releases a round: from now the panel sees its result, and no review changes. */
export function releaseRound(unit: UnitView, round: RoundRow, actor: Actor, at: number): void {
  unit.add({
    sql: 'UPDATE forms_review_rounds SET released_at = ?, released_by = ? WHERE id = ? AND released_at IS NULL AND closed_at IS NULL',
    params: [at, actor.accountId ?? null, round.id],
  }).expect(1, { code: 'forms.review.released', reason: 'These reviews are already released, or the response has moved on.' })
  unit.audit({ action: 'state', record: ['forms.response', round.responseId], detail: { formId: round.formId, round: round.id, released: true } })
}

export interface RoundView {
  roundId: string
  stage: string
  mode: Review['mode']
  open: boolean
  released: boolean
  assigned: number
  submitted: number
  conflicted: number
  /** A vote's count, once it may be seen. */
  tally: Tally | null
  /** A scored round's summary, once it may be seen. */
  summary: ScoreSummary | null
  /** Each review with its reviewer's name, where the reader may see who said what. */
  reviews: { reviewer: string, vote: Vote | null, scores: Record<string, number>, comment: string }[] | null
}

/**
 * What a reader may see of a response's latest round. Before release (unless the stage reviews in
 * the open) only how many reviews are in. After it, the result; who said what goes to the panel
 * for scores, and for a vote only to the chair, and to nobody when the vote is secret.
 */
export async function roundView(def: Definition, responseId: string, reader: 'chair' | 'panel' | 'reader'): Promise<RoundView | null> {
  const round = await latestRound(responseId)
  const stage = round ? stageOf(def, round.stageKey) : undefined
  const review = stage?.review
  if (!round || !stage || !review) return null
  const rows = await all<AssignmentRow & { name: string | null }>(
    `SELECT a.id, a.status, a.vote, a.scores, a.comment, a.submitted_at AS submittedAt, COALESCE(c.preferred_name, c.name) AS name
     FROM forms_review_assignments a LEFT JOIN core_accounts c ON c.id = a.reviewer_id WHERE a.round_id = ? ORDER BY name, a.id`, round.id)
  const done = rows.filter(r => r.status === 'submitted')
  const shown = reader !== 'reader' && (round.releasedAt !== null || !!review.open)
  const named = shown && (review.mode === 'scores' || (reader === 'chair' && !review.secret))
  const marks = done.map(r => (r.scores ? JSON.parse(r.scores) : {}) as Record<string, number>)
  return {
    roundId: round.id,
    stage: stage.name,
    mode: review.mode,
    open: round.closedAt === null,
    released: round.releasedAt !== null,
    assigned: rows.filter(r => r.status !== 'conflicted').length,
    submitted: done.length,
    conflicted: rows.filter(r => r.status === 'conflicted').length,
    tally: shown && review.mode === 'vote' ? tally(review, done.map(r => r.vote!)) : null,
    summary: shown && review.mode === 'scores' ? summarise(review.criteria ?? [], marks) : null,
    reviews: named ? done.map((r, i) => ({ reviewer: r.name ?? '', vote: r.vote, scores: marks[i]!, comment: r.comment ?? '' })) : null,
  }
}

export interface Waiting { assignmentId: string, title: string, reference: string, stage: string, mode: Review['mode'], status: 'assigned' | 'submitted', released: boolean, openedAt: number }
/** The reviews a person is asked for now: their assignments in rounds still open, oldest first. */
export async function waitingFor(accountId: string): Promise<Waiting[]> {
  const rows = await all<{ assignmentId: string, title: string, reference: string, stageKey: string, status: 'assigned' | 'submitted', releasedAt: number | null, openedAt: number, workflow: string | null }>(
    `SELECT a.id AS assignmentId, f.title, r.reference, n.stage_key AS stageKey, a.status, n.released_at AS releasedAt, n.opened_at AS openedAt, json_extract(v.definition, '$.workflow') AS workflow
     FROM forms_review_assignments a JOIN forms_review_rounds n ON n.id = a.round_id JOIN forms_responses r ON r.id = a.response_id JOIN forms_forms f ON f.id = a.form_id JOIN forms_versions v ON v.id = r.version_id
     WHERE a.reviewer_id IN (${accountScopeSql('?1')}) AND a.status <> 'conflicted' AND n.closed_at IS NULL AND r.state = 'submitted'
     ORDER BY n.opened_at, a.id LIMIT 200`, accountId) // not-policy: more than anyone is asked for at once
  return rows.flatMap((r) => {
    const stage = r.workflow ? stageOf({ format: 1, pages: [], workflow: JSON.parse(r.workflow) } as Definition, r.stageKey) : undefined
    if (!stage?.review) return []
    return [{ assignmentId: r.assignmentId, title: r.title, reference: r.reference, stage: stage.name, mode: stage.review.mode, status: r.status, released: r.releasedAt !== null, openedAt: r.openedAt }]
  })
}
