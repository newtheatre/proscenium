// Answering a form and reading what was answered (form builder specification, parts 2 and 3;
// FB-301 to FB-304, FB-401, FB-402, FB-601). A form is offered on a link (a placement), a person
// keeps an unsent working copy, and sending stores the response and one row per answer in one unit
// of work. The server never trusts what the browser worked out: it runs the engine again on the
// answers, drops what logic hides, and refuses what is not valid.
import { all, first, linkTokens, newId, openSpecial, refuse, sealSpecial, today, useSetting, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import type { Answers, CalculationType, DataClass, Definition, Entry, Evaluation, Marked, Question, Stage, Value } from '../shared/engine'
import { moneyWords } from '../shared/words'
import { OTHER, SUBMIT, evaluate, firstStage, hasAnswerKey, isEmpty, isFinal, mark, otherKey, questionsOf } from '../shared/engine'
import { answers as answersTable } from './db/schema'
import type { FormRow, VersionRow } from './forms'
import { openRound } from './review'
import { tellReceived } from './notices'
import { recordLabels } from './sources'
import { REASONS, RESPONSE, refuseShut, shut, getResponse, type LinkRow, type ResponseRow } from './response-rows'
import { figureName, specialCalculations, type Figure } from '../shared/figures'
import { attachFileAnswers, refuseFileProblems, settleFileAnswers } from './files'

export { PLACE, REASONS, getLink, shut, refuseShut, getResponse, type LinkRow, type StoredPlace, type Shut, type ResponseRow } from './response-rows'

/** Whether a response is this person's: by account, across any merged into it. A signed-out response is nobody's to come back to. */
export async function owns(response: ResponseRow, actor: Actor): Promise<boolean> {
  if (!actor.accountId || !response.personId) return false
  return !!await first(`SELECT 1 AS yes WHERE ?1 IN (${accountScopeSql('?2')})`, response.personId, actor.accountId)
}

/** The person's unsent working copy on this link, if they have one. */
export async function draftOf(link: LinkRow, actor: Actor): Promise<{ response: ResponseRow, answers: Answers, pageId: string | null } | null> {
  if (!actor.accountId) return null
  const response = await first<ResponseRow>(`SELECT ${RESPONSE} FROM forms_responses WHERE placement_id = ?1 AND state = 'draft' AND person_id IN (${accountScopeSql('?2')}) ORDER BY created_at DESC LIMIT 1`, link.id, actor.accountId)
  if (!response) return null
  const kept = await first<{ answersCipher: string, pageId: string | null }>('SELECT answers_cipher AS answersCipher, page_id AS pageId FROM forms_response_drafts WHERE response_id = ?', response.id)
  const plain = kept ? await openSpecial(kept.answersCipher) : null
  return { response, answers: plain ? JSON.parse(plain) as Answers : {}, pageId: kept?.pageId ?? null }
}

const REFERENCE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // not-policy: letters and digits nobody mistakes for each other
const REFERENCE_LENGTH = 8 // not-policy: short enough to read out, long enough not to be guessed in passing
export function newReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(REFERENCE_LENGTH))
  return [...bytes].map(b => REFERENCE_LETTERS[b % REFERENCE_LETTERS.length]).join('')
}

/** The key that holds one response each: the account, or a keyed hash of the address given. */
export async function uniqueKeyOf(link: LinkRow, accountId: string | undefined, email: string | null): Promise<string | null> {
  if (!link.onePerPerson) return null
  if (accountId) return accountId
  // The kit's keyed hash, so the address itself is never the key.
  return email ? `email:${await linkTokens.hash(`forms.one-each:${email}`)}` : null
}

/** The largest working copy or set of answers taken, in bytes. */
export async function answersLimit(): Promise<number> {
  return (await useSetting('forms.limits.response-size') as number) * 1024 // not-policy: kilobytes to bytes
}

/** Keeps a signed-in person's working copy, sealed. Nothing is checked but that it is theirs. */
export async function writeDraft(unit: UnitView, input: { existing: ResponseRow | null, responseId: string, form: FormRow, link: LinkRow, accountId: string, answers: Answers, pageId: string | null, at: number }): Promise<void> {
  const sealed = await sealSpecial(JSON.stringify(input.answers))
  if (!input.existing) {
    unit.add({
      sql: 'INSERT INTO forms_responses (id, reference, form_id, version_id, placement_id, subject_type, subject_id, realm, person_id, state, current_revision, is_test, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, \'audience\', ?, \'draft\', 0, 0, ?, ?)',
      params: [input.responseId, newReference(), input.form.id, input.form.liveVersionId, input.link.id, input.link.subjectType, input.link.subjectId, input.accountId, input.at, input.at],
    }).expect(1)
  }
  else {
    unit.add({ sql: 'UPDATE forms_responses SET updated_at = ? WHERE id = ? AND state = \'draft\'', params: [input.at, input.responseId] }).expect(1)
  }
  unit.add({
    sql: 'INSERT INTO forms_response_drafts (response_id, answers_cipher, page_id, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (response_id) DO UPDATE SET answers_cipher = ?2, page_id = ?3, updated_at = ?4',
    params: [input.responseId, sealed, input.pageId, input.at],
  })
}

// ---- answers as rows ----

interface AnswerRow {
  responseId: string
  revision: number
  questionId: string
  repeatIndex: number
  dataClass: DataClass
  valueText: string | null
  valueNumber: number | null
  valueJson: string | null
  otherText: string | null
  valueCipher: string | null
  labelSnapshot: string | null
}

const optionWords = (q: Question, id: string, other: unknown): string => id === OTHER ? (typeof other === 'string' && other.trim() ? other.trim() : 'Other') : q.options?.find(o => o.id === id)?.label ?? id

/** The words of what was chosen, so a renamed or removed option still reads as it did. */
function snapshot(q: Question, value: Value, other: unknown, labels?: Record<string, string>): string | null {
  // A chosen record reads as it was named when the response was sent.
  if (q.type === 'record') return (typeof value === 'string' ? [value] : Array.isArray(value) ? value as string[] : []).map(id => labels?.[id] ?? id).join('; ') || null
  if (!q.type.startsWith('choice.')) return null
  if (typeof value === 'string') return optionWords(q, value, other)
  if (Array.isArray(value)) return (value as string[]).map(v => optionWords(q, v, other)).join('; ')
  return null
}

async function rowOf(base: Pick<AnswerRow, 'responseId' | 'revision'>, q: Question, repeatIndex: number, value: Value, other: unknown, labels?: Record<string, string>): Promise<AnswerRow | null> {
  if (isEmpty(value)) return null
  const row: AnswerRow = { ...base, questionId: q.id, repeatIndex, dataClass: q.dataClass, valueText: null, valueNumber: null, valueJson: null, otherText: null, valueCipher: null, labelSnapshot: null }
  const otherText = typeof other === 'string' && other.trim() ? other.trim() : null
  // A special-category answer is held only sealed (FB-601): nothing of it sits in a readable column.
  if (q.dataClass === 'special') return { ...row, valueCipher: await sealSpecial(JSON.stringify({ value, other: otherText, label: snapshot(q, value, other, labels) })) }
  if (typeof value === 'string') row.valueText = value
  else if (typeof value === 'number') row.valueNumber = value
  else if (typeof value === 'boolean') row.valueNumber = value ? 1 : 0
  else row.valueJson = JSON.stringify(value)
  return { ...row, otherText, labelSnapshot: snapshot(q, value, other, labels) }
}

/** One row per answered question, and per entry of a repeating group. Hidden answers are already gone. */
export async function answerRows(def: Definition, kept: Answers, responseId: string, revision: number): Promise<AnswerRow[]> {
  const out: AnswerRow[] = []
  const base = { responseId, revision }
  // Every record chosen is checked against its source, and refused if the source does not know it.
  const labels = await recordLabels(def, kept)
  for (const { question: q, group } of questionsOf(def)) {
    if (!group) {
      const row = await rowOf(base, q, 0, kept[q.id] as Value, kept[otherKey(q.id)], labels.get(q.id))
      if (row) out.push(row)
      continue
    }
    const entries = Array.isArray(kept[group.id]) ? kept[group.id] as Entry[] : []
    for (const [i, entry] of entries.entries()) {
      const row = await rowOf(base, q, i, entry[q.id], entry[otherKey(q.id)], labels.get(q.id))
      if (row) out.push(row)
    }
  }
  return out
}

/** Refuses answers the engine finds wrong, naming each path so the page can put the words beside it. */
export function refuseInvalid(evaluation: Evaluation): void {
  if (evaluation.ending && !evaluation.ending.submits)
    refuse('forms.response.ends-unsent', 'These answers lead to an ending that sends nothing.', { status: 422 }) // not-policy: HTTP status
  if (evaluation.valid) return
  const fields = Object.fromEntries(Object.entries(evaluation.issues).map(([path, issues]) => [path, `forms.issues.${issues[0]!.rule}`]))
  refuse('forms.response.invalid', 'Some answers need attention.', { status: 422, fields }) // not-policy: HTTP status
}

/** When a response's retention period ends: counted from the moment it reaches a final stage, and not before. */
export const retentionFrom = (form: FormRow, kind: string, at: number): number | null =>
  form.retentionDays === null || !isFinal(kind) ? null : at + form.retentionDays * 86_400_000 // not-policy: milliseconds in a day

/** Writes the history row of a move, in the unit that makes it (FB-403). */
export function recordMove(unit: UnitView, move: { responseId: string, from: string | null, to: Stage, transitionKey: string, revision: number, actorId: string | null, at: number }): void {
  unit.add({
    sql: 'INSERT INTO forms_stage_history (id, response_id, from_stage, to_stage, to_kind, transition_key, revision, actor_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [newId('fstg'), move.responseId, move.from, move.to.key, move.to.kind, move.transitionKey, move.revision, move.actorId, move.at],
  })
}

export interface Sending {
  responseId: string
  form: FormRow
  version: VersionRow
  link: LinkRow
  actor: Actor
  email: string | null
  answers: Answers
  /** The person's own working copy this sends, if it is one. */
  draft: ResponseRow | null
  at: number
}

/**
 * Stores a response: the count against the cap, the response, its answers, the audit entry and the
 * event, together or not at all (FB-302). The cap and one response each are held by the statements
 * themselves, so two people sending at the same moment cannot both take the last place (FB-301).
 */
/** A marking as the response row keeps it: score, out of and passed, each null where nothing is marked. */
export const markingColumns = (marked: Marked | null): [number | null, number | null, boolean | null] => marked ? [marked.score, marked.outOf, marked.passed] : [null, null, null]

export async function writeSubmission(unit: UnitView, s: Sending): Promise<{ reference: string, marking: Marked | null }> {
  const def = JSON.parse(s.version.definition) as Definition
  // Each file answer is read back from core's store first, so the engine checks what core holds; a file must have passed its check.
  const fileProblems = await settleFileAnswers(def, s.answers, s.responseId)
  const evaluation = evaluate(def, s.answers, { today: await today() })
  const fileIds = refuseFileProblems(def, evaluation.answers, fileProblems)
  refuseInvalid(evaluation)

  const personId = s.form.anonymous ? null : s.actor.accountId ?? null
  const email = s.form.anonymous || personId ? null : s.email
  const uniqueKey = await uniqueKeyOf(s.link, personId ?? undefined, email)
  const reference = s.draft?.reference ?? newReference()
  // A response starts in the form's first stage; its retention period runs once it reaches a final one.
  const stage = firstStage(def)
  const retentionDue = retentionFrom(s.form, stage.kind, s.at)
  const calculated = Object.keys(evaluation.calculated).length ? JSON.stringify(evaluation.calculated) : null
  // MK1: marked here, from what is stored, against the key of the version answered.
  const marking = mark(def, evaluation)
  const [score, outOf, passed] = markingColumns(marking)

  unit.add({
    sql: 'UPDATE forms_placements SET response_count = response_count + 1 WHERE id = ?1 AND status = \'active\' AND (response_cap IS NULL OR response_count < response_cap) AND (opens_at IS NULL OR opens_at <= ?2) AND (closes_at IS NULL OR closes_at > ?2)',
    params: [s.link.id, s.at],
  }).expect(1, { code: 'forms.link.full', reason: REASONS.full.reason })

  const once = { code: 'forms.link.answered', reason: REASONS.answered.reason }
  const taken = 'EXISTS (SELECT 1 FROM forms_responses WHERE placement_id = ?2 AND unique_key = ?3 AND id <> ?1)'
  if (s.draft) {
    unit.add({
      sql: `UPDATE forms_responses SET state = 'submitted', stage_key = ?8, stage_kind = ?9, current_revision = 1, version_id = ?4, unique_key = ?3, calculated = ?5, score = ?10, out_of = ?11, passed = ?12, submitted_at = ?6, updated_at = ?6, retention_due_at = ?7 WHERE id = ?1 AND state = 'draft' AND NOT ${taken}`, // not-policy: numbered parameters
      params: [s.responseId, s.link.id, uniqueKey, s.version.id, calculated, s.at, retentionDue, stage.key, stage.kind, score, outOf, passed],
    }).expect(1, once)
    unit.add({ sql: 'DELETE FROM forms_response_drafts WHERE response_id = ?', params: [s.responseId] })
  }
  else {
    unit.add({
      sql: `INSERT INTO forms_responses (id, placement_id, unique_key, reference, form_id, version_id, realm, person_id, respondent_email, state, stage_key, stage_kind, current_revision, calculated, score, out_of, passed, is_test, submitted_at, created_at, updated_at, retention_due_at, subject_type, subject_id) SELECT ?1, ?2, ?3, ?4, ?5, ?6, 'audience', ?7, ?8, 'submitted', ?12, ?13, 1, ?9, ?16, ?17, ?18, 0, ?10, ?10, ?10, ?11, ?14, ?15 WHERE NOT ${taken}`, // not-policy: numbered parameters
      params: [s.responseId, s.link.id, uniqueKey, reference, s.form.id, s.version.id, personId, email, calculated, s.at, retentionDue, stage.key, stage.kind, s.link.subjectType, s.link.subjectId, score, outOf, passed],
    }).expect(1, once)
  }

  const rows = await answerRows(def, evaluation.answers, s.responseId, 1)
  if (rows.length) unit.insertSet(answersTable, rows as unknown as Record<string, unknown>[])
  attachFileAnswers(unit, s.responseId, fileIds, s.at)
  recordMove(unit, { responseId: s.responseId, from: null, to: stage, transitionKey: SUBMIT, revision: 1, actorId: s.actor.accountId ?? null, at: s.at })
  await openRound(unit, { def, stage, formId: s.form.id, title: s.form.title, responseId: s.responseId, personId, revision: 1, at: s.at, answers: evaluation.answers })
  unit.audit({ action: 'create', record: ['forms.response', s.responseId], detail: { formId: s.form.id, version: s.version.number } })
  unit.announce('forms.response.submitted', { responseId: s.responseId, formId: s.form.id }, { record: ['forms.response', s.responseId] })
  await tellReceived(unit, s.form, { id: s.responseId, reference, personId, respondentEmail: email })
  return { reference, marking }
}

/**
 * Sends a response on a place, with every check the public route makes (FB-301, FB-302): a repeat
 * of the same submission stores nothing and gets the same reply; an id that is somebody else's
 * reads as no response; the place must be open to this person now; the answers must fit the size
 * limit; somebody signed out gives an address unless the form is anonymous. Then the response is
 * written in the caller's unit by writeSubmission. Shared by POST /api/forms/open/:slug/responses
 * and the addResponse service another module calls.
 */
export async function sendResponse(unit: UnitView, input: { form: FormRow, version: VersionRow, link: LinkRow, actor: Actor, responseId: string, answers: Answers, email: string | null, at: number }): Promise<{ responseId: string, reference: string, marking: Marked | null }> {
  const { form, link, actor } = input
  const existing = await getResponse(input.responseId)
  const theirs = existing ? await owns(existing, actor) : false
  if (existing) {
    // Sent before: the same reply, and nothing written. A signed-out person's is known by the address it carried.
    const same = existing.formId === form.id && (theirs || (!existing.personId && !actor.accountId && existing.respondentEmail === (form.anonymous ? null : input.email)))
    if (existing.state === 'submitted' && same) return { responseId: existing.id, reference: existing.reference, marking: await markingOf(existing) }
    // Somebody else's id reads the same as one that was never an id.
    if (!(existing.state === 'draft' && theirs && existing.formId === form.id)) return refuse('forms.response.not-found', 'There is no response here.', { status: 404 }) // not-policy: HTTP status
  }

  const why = await shut(form, link, actor, input.at)
  if (why) refuseShut(why)
  if (JSON.stringify(input.answers).length > await answersLimit()) return refuse('forms.response.too-large', 'These answers are too long to send.', { status: 413 }) // not-policy: HTTP status
  if (!form.anonymous && !actor.accountId && !input.email)
    return refuse('forms.response.email-needed', 'Give an email address so we know who these answers are from.', { status: 422, fields: { email: 'forms.response.email-needed' } }) // not-policy: HTTP status

  const { reference, marking } = await writeSubmission(unit, { responseId: input.responseId, form, version: input.version, link, actor, email: input.email, answers: input.answers, draft: existing, at: input.at })
  return { responseId: input.responseId, reference, marking }
}

/**
 * How a sent response was marked, question by question, worked out again from its current answers
 * and its version's key. The totals are the stored ones (MK1). Null where the version has no key.
 */
export async function markingOf(response: Pick<ResponseRow, 'id' | 'versionId' | 'currentRevision' | 'score' | 'outOf' | 'passed'>, def?: Definition, revision = response.currentRevision): Promise<Marked | null> {
  const definition = def ?? JSON.parse((await first<{ definition: string }>('SELECT definition FROM forms_versions WHERE id = ?', response.versionId))!.definition) as Definition
  if (!hasAnswerKey(definition)) return null
  const types = new Map(questionsOf(definition).map(({ question }) => [question.id, question.type]))
  // A special-category question cannot carry a correct answer, so nothing sealed is opened to mark.
  const stored = (await readAnswers([response.id], types, false, revision)).get(response.id) ?? []
  const marked = mark(definition, evaluate(definition, toAnswers(definition, stored), { today: await today() }))
  // An earlier revision's score is worked out again (MK5); only the latest is stored.
  if (!marked || revision !== response.currentRevision || response.score === null || response.outOf === null) return marked
  return { ...marked, score: response.score, outOf: response.outOf, passed: response.passed === null ? null : !!response.passed }
}

// ---- reading answers back ----

export interface StoredAnswer {
  questionId: string
  repeatIndex: number
  dataClass: DataClass
  /** True when the answer is special-category and was not opened. */
  restricted: boolean
  value: Value
  other: string | null
  /** The words to show: the chosen options as they read when it was sent, or the value itself. */
  label: string | null
}

interface AnswerRecord { responseId: string, questionId: string, repeatIndex: number, dataClass: DataClass, valueText: string | null, valueNumber: number | null, valueJson: string | null, otherText: string | null, valueCipher: string | null, labelSnapshot: string | null }

async function unpack(row: AnswerRecord, type: string | undefined, open: boolean): Promise<StoredAnswer> {
  const base = { questionId: row.questionId, repeatIndex: row.repeatIndex, dataClass: row.dataClass }
  if (row.valueCipher !== null) {
    if (!open) return { ...base, restricted: true, value: null, other: null, label: null }
    const held = JSON.parse((await openSpecial(row.valueCipher))!) as { value: Value, other: string | null, label: string | null }
    return { ...base, restricted: false, value: held.value, other: held.other, label: held.label }
  }
  const truth = type === 'yesno' || type === 'consent'
  const value: Value = row.valueJson !== null ? JSON.parse(row.valueJson) as Value : row.valueNumber !== null ? (truth ? row.valueNumber === 1 : row.valueNumber) : row.valueText
  return { ...base, restricted: false, value, other: row.otherText, label: row.labelSnapshot }
}

/**
 * The current answers of some responses, by response. `open` says whether special-category answers
 * are opened; when it is false they come back marked restricted and nothing is decrypted. An
 * earlier revision is read by its number.
 */
export async function readAnswers(responseIds: string[], types: Map<string, string>, open: boolean, revision?: number): Promise<Map<string, StoredAnswer[]>> {
  const out = new Map<string, StoredAnswer[]>(responseIds.map(id => [id, []]))
  if (!responseIds.length) return out
  // One parameter however many responses: D1 allows a hundred bound values and no more.
  const rows = await all<AnswerRecord>(
    `SELECT a.response_id AS responseId, a.question_id AS questionId, a.repeat_index AS repeatIndex, a.data_class AS dataClass, a.value_text AS valueText, a.value_number AS valueNumber, a.value_json AS valueJson, a.other_text AS otherText, a.value_cipher AS valueCipher, a.label_snapshot AS labelSnapshot
     FROM forms_answers a JOIN forms_responses r ON r.id = a.response_id AND a.revision = COALESCE(?2, r.current_revision)
     WHERE a.response_id IN (SELECT value FROM json_each(?1)) ORDER BY a.response_id, a.question_id, a.repeat_index`, JSON.stringify(responseIds), revision ?? null)
  for (const row of rows) out.get(row.responseId)!.push(await unpack(row, types.get(row.questionId), open))
  return out
}

/** Stored answers as the form takes them: by question id, a repeating group's as its entries. For a person changing their own response. */
export function toAnswers(def: Definition, stored: StoredAnswer[]): Answers {
  const out: Answers = {}
  for (const { question: q, group } of questionsOf(def)) {
    for (const a of stored.filter(s => s.questionId === q.id && !s.restricted)) {
      if (!group) {
        out[q.id] = a.value
        if (a.other !== null) out[otherKey(q.id)] = a.other
        continue
      }
      const entries = (out[group.id] ??= []) as Entry[]
      while (entries.length <= a.repeatIndex) entries.push({})
      entries[a.repeatIndex]![q.id] = a.value
      if (a.other !== null) entries[a.repeatIndex]![otherKey(q.id)] = a.other
    }
  }
  return out
}

/** An answer as one line of plain words, for a table cell or a CSV field. */
export function words(answer: StoredAnswer, type: string | undefined, currency?: string, fileLink?: (id: string) => string): string {
  if (answer.restricted) return ''
  if (answer.label !== null) return answer.label
  const v = answer.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  // With a currency, money reads as money ("£12.50"); without, as a plain figure a spreadsheet can add up.
  if (typeof v === 'number') return type !== 'money' ? String(v) : currency ? moneyWords(v, currency) : (v / 100).toFixed(2) // not-policy: minor units to units
  if (typeof v === 'string') return v
  // A file reads as its name, and in an export with the address to open it at.
  if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? x : fileLink ? `${x.name} (${fileLink(x.id)})` : x.name).join('; ')
  return [v.line1, v.line2, v.town, v.county, v.postcode, v.country].filter(Boolean).join(', ')
}

/**
 * The calculated values stored on a response, by calculation id: the server's own, never the
 * browser's. Those worked out from special-category answers are left out unless `open`, as the
 * answers are. Null when nothing was stored.
 */
export function storedFigures(def: Definition, calculated: string | null, open: boolean): Record<string, Figure> | null {
  if (calculated === null) return null
  const all = JSON.parse(calculated) as Record<string, Figure>
  const shut = open ? new Set<string>() : specialCalculations(def)
  return Object.fromEntries(Object.entries(all).filter(([id]) => !shut.has(id)))
}

export interface FigureColumn { id: string, key: string, label: string, type: CalculationType, restricted: boolean }
/** A column per calculation of the live version, in its order; those read from special-category answers are marked. */
export function figureColumns(live: Definition | null): FigureColumn[] {
  if (!live) return []
  const special = specialCalculations(live)
  return (live.calculations ?? []).map(c => ({ id: c.id, key: c.key, label: figureName(c), type: c.type, restricted: special.has(c.id) }))
}

// ---- the responses of a form ----

export interface ResponseFilter {
  from?: number
  to?: number
  questionId?: string
  value?: string
  stage?: string
  /** The account reading: responses they have a conflict of interest on are left out (FB-406). */
  reader?: string
}
export interface ListedResponse { id: string, calculated: string | null, reference: string, versionId: string, stageKey: string | null, stageKind: string | null, versionNumber: number, personId: string | null, personName: string | null, respondentEmail: string | null, submittedAt: number }

function where(formId: string, filter: ResponseFilter): { sql: string, params: unknown[] } {
  const parts = ['r.form_id = ?', 'r.state = \'submitted\'']
  const params: unknown[] = [formId]
  if (filter.from !== undefined) {
    parts.push('r.submitted_at >= ?')
    params.push(filter.from)
  }
  if (filter.to !== undefined) {
    parts.push('r.submitted_at < ?')
    params.push(filter.to)
  }
  if (filter.stage !== undefined) {
    parts.push('r.stage_key = ?')
    params.push(filter.stage)
  }
  if (filter.reader !== undefined) {
    parts.push('NOT EXISTS (SELECT 1 FROM forms_review_assignments c JOIN core_accounts me ON me.id = ? WHERE c.response_id = r.id AND c.status = \'conflicted\' AND (c.reviewer_id = me.id OR c.reviewer_id = me.merged_into_id OR c.reviewer_id IN (SELECT id FROM core_accounts WHERE merged_into_id = COALESCE(me.merged_into_id, me.id))))')
    params.push(filter.reader)
  }
  if (filter.questionId !== undefined && filter.value !== undefined) {
    // A plain answer by its value; one of several choices by its place in the list. Sealed answers are never matched.
    parts.push('EXISTS (SELECT 1 FROM forms_answers a WHERE a.response_id = r.id AND a.revision = r.current_revision AND a.question_id = ? AND (a.value_text = ? OR CAST(a.value_number AS TEXT) = ? OR EXISTS (SELECT 1 FROM json_each(a.value_json) j WHERE j.value = ?)))')
    params.push(filter.questionId, filter.value, filter.value, filter.value)
  }
  return { sql: parts.join(' AND '), params }
}

/** Sent responses, newest first, with how many there are in all under the same filter. */
export async function listResponses(formId: string, filter: ResponseFilter, limit: number, offset: number): Promise<{ rows: ListedResponse[], total: number }> {
  const w = where(formId, filter)
  const total = (await first<{ n: number }>(`SELECT COUNT(*) AS n FROM forms_responses r WHERE ${w.sql}`, ...w.params))!.n
  const rows = await all<ListedResponse>(
    `SELECT r.id, r.calculated, r.reference, r.version_id AS versionId, r.stage_key AS stageKey, r.stage_kind AS stageKind, v.number AS versionNumber, r.person_id AS personId, a.name AS personName, r.respondent_email AS respondentEmail, r.submitted_at AS submittedAt
     FROM forms_responses r JOIN forms_versions v ON v.id = r.version_id LEFT JOIN core_accounts a ON a.id = r.person_id
     WHERE ${w.sql} ORDER BY r.submitted_at DESC, r.id DESC LIMIT ? OFFSET ?`, ...w.params, limit, offset)
  return { rows, total }
}

export interface Column { questionId: string, key: string, label: string, type: string, dataClass: DataClass, retired: boolean }

/** One column per question the form has ever had: the live version's in its order, then the retired ones (FB-401). */
export function columnsOf(fields: { questionId: string, key: string, label: string, type: string, dataClass: DataClass, retiredInVersion: number | null }[], live: Definition | null): Column[] {
  const place = new Map((live ? questionsOf(live) : []).map(({ question }, i) => [question.id, i]))
  const column = (f: typeof fields[number]): Column => ({ questionId: f.questionId, key: f.key, label: f.label, type: f.type, dataClass: f.dataClass, retired: f.retiredInVersion !== null || !place.has(f.questionId) })
  const all = fields.map(column)
  const order = (c: Column) => place.get(c.questionId) ?? Number.MAX_SAFE_INTEGER
  return [...all.filter(c => !c.retired).sort((a, b) => order(a) - order(b)), ...all.filter(c => c.retired).sort((a, b) => a.key.localeCompare(b.key))]
}

/** A response's answers as one cell per column. Entries of a repeating group share a cell. */
export function cells(answers: StoredAnswer[], columns: Column[], currency?: string, fileLink?: (id: string) => string): Record<string, { text: string, restricted: boolean }> {
  const out: Record<string, { text: string, restricted: boolean }> = {}
  const type = new Map(columns.map(c => [c.questionId, c.type]))
  for (const a of answers) {
    const text = words(a, type.get(a.questionId), currency, fileLink)
    const cell = out[a.questionId]
    if (!cell) out[a.questionId] = { text, restricted: a.restricted }
    else if (!a.restricted && text) cell.text = cell.text ? `${cell.text} | ${text}` : text
  }
  return out
}

/** Rows as CSV. A cell a spreadsheet would run as a formula is written as text. */
export function toCsv(header: string[], rows: string[][]): string {
  const cell = (value: string): string => {
    const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return `${[header, ...rows].map(r => r.map(cell).join(',')).join('\r\n')}\r\n`
}
