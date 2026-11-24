// A form's link and a response's row, read without the rest of answering a form, so that the
// files responses.ts calls (changes, slots, review, notices) can read them without importing it back.
import { first, refuse, type Actor } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import type { FormRow } from './forms'

export interface LinkRow {
  id: string
  formId: string
  audience: 'anyone' | 'signed_in'
  opensAt: number | null
  closesAt: number | null
  responseCap: number | null
  responseCount: number
  onePerPerson: boolean
  status: 'active' | 'paused' | 'ended'
  /** `forms.link` for the form's own link, or the slot another module declared. */
  slotKey: string
  /** The record the answers are about, when the form is attached to one. */
  subjectType: string | null
  subjectId: string | null
}
type Stored<T, K extends keyof T> = Omit<T, K> & Record<K, number>
export type StoredPlace = Stored<LinkRow, 'onePerPerson'>
export const PLACE = 'id, form_id AS formId, audience, opens_at AS opensAt, closes_at AS closesAt, response_cap AS responseCap, response_count AS responseCount, one_per_person AS onePerPerson, status, slot_key AS slotKey, subject_type AS subjectType, subject_id AS subjectId'

/** The form's own link, if it has been given one. A form is offered nowhere until it is. */
export async function getLink(formId: string): Promise<LinkRow | null> {
  const row = await first<Stored<LinkRow, 'onePerPerson'>>(
    `SELECT ${PLACE} FROM forms_placements WHERE form_id = ? AND slot_key = 'forms.link' AND subject_type IS NULL`, formId)
  return row ? { ...row, onePerPerson: !!row.onePerPerson } : null
}

/** Why a form cannot be answered just now, in the order a person would want to hear it. */
export type Shut = 'paused' | 'not-yet' | 'closed' | 'full' | 'sign-in' | 'answered'

export const REASONS: Record<Shut, { reason: string, remedy?: string }> = {
  'paused': { reason: 'This form is not taking answers at the moment.' },
  'not-yet': { reason: 'This form has not opened yet.', remedy: 'Come back when it opens.' },
  'closed': { reason: 'This form has closed.' },
  'full': { reason: 'This form has had all the responses it can take.' },
  'sign-in': { reason: 'This form is for people with an account.', remedy: 'Sign in, then open the form again.' },
  'answered': { reason: 'You have already answered this form.' },
}

/** The first thing in the way of this person answering now, or null. `ownId` is a response of theirs that does not count against them. */
export async function shut(form: FormRow, link: LinkRow, actor: Actor, at: number, ownId?: string): Promise<Shut | null> {
  if (form.status === 'closed') return 'closed'
  if (form.status !== 'live' || link.status !== 'active') return 'paused'
  if (link.opensAt !== null && at < link.opensAt) return 'not-yet'
  if (link.closesAt !== null && at >= link.closesAt) return 'closed'
  if (link.audience === 'signed_in' && !actor.accountId) return 'sign-in'
  if (link.onePerPerson && actor.accountId) {
    const theirs = await first<{ id: string }>(`SELECT id FROM forms_responses WHERE placement_id = ?1 AND state = 'submitted' AND person_id IN (${accountScopeSql('?2')})`, link.id, actor.accountId)
    if (theirs && theirs.id !== ownId) return 'answered'
  }
  if (link.responseCap !== null && link.responseCount >= link.responseCap) return 'full'
  return null
}

export function refuseShut(why: Shut): never {
  const { reason, remedy } = REASONS[why]
  return refuse(`forms.link.${why}`, reason, { status: why === 'sign-in' ? 401 : 409, ...(remedy ? { remedy } : {}) }) // not-policy: HTTP statuses
}

// ---- a response ----

export interface ResponseRow {
  id: string
  reference: string
  formId: string
  versionId: string
  placementId: string
  subjectType: string | null
  subjectId: string | null
  personId: string | null
  respondentEmail: string | null
  state: 'draft' | 'awaiting_payment' | 'submitted' | 'withdrawn'
  stageKey: string | null
  stageKind: string | null
  stageNote: string | null
  currentRevision: number
  submittedAt: number | null
  decidedAt: number | null
  decisionReason: string | null
  /** What the form's calculations came to, as the server worked them out when it was last sent (JSON). */
  calculated: string | null
  /** What it scored against its version's correct answers when it was last sent; null where the version has none. */
  score: number | null
  outOf: number | null
  passed: boolean | null
  createdAt: number
}
export const RESPONSE = 'calculated, score, out_of AS outOf, passed, subject_type AS subjectType, subject_id AS subjectId, decided_at AS decidedAt, decision_reason AS decisionReason, id, reference, form_id AS formId, version_id AS versionId, placement_id AS placementId, person_id AS personId, respondent_email AS respondentEmail, state, stage_key AS stageKey, stage_kind AS stageKind, stage_note AS stageNote, current_revision AS currentRevision, submitted_at AS submittedAt, created_at AS createdAt'
export const getResponse = (id: string) => first<ResponseRow>(`SELECT ${RESPONSE} FROM forms_responses WHERE id = ?`, id)
