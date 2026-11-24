// Agreements (spec part 3, rules A1 to A6): versions that never change but for their state, sent to the
// company's contacts, answered once online or recorded from paper, and on acceptance the guest places.
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, useSetting } from '#kit'
import type { Actor, UnitOfWork } from '#kit'
import { DURATION, parseDuration } from '#kit/duration'
import { notify } from '#modules/core'
import { ANSWERS, DEAL_TYPES, HIRE_FEE_BASES, LIMITS, SHARE_BASES } from '../shared/companies'
import { allocations as allocationsTable } from './db/schema'
import type { AgreementVersion } from '../shared/views'
import { isLiveContact } from './contacts'
import type { Engagement } from './engagements'

export interface Agreement {
  id: string
  engagementId: string
  version: number
  dealType: typeof DEAL_TYPES[number]
  companyShareBp: number | null
  shareBasis: string | null
  guaranteeMinor: number | null
  hireFeeMinor: number | null
  hireFeeBasis: string | null
  guestPlaces: number
  guestNamesDue: string
  state: string
  createdBy: string | null
}

const money = z.number().int().min(0)
const STEPS = [['d', 86_400], ['h', 3600], ['m', 60], ['s', 1]] as const // not-policy: units of time

/** A setting's seconds written as the agreement stores a duration, in days, hours or minutes: 1209600 is '14d'. */
function asDuration(seconds: number): string {
  const [code, size] = STEPS.find(([, size]) => seconds >= size && seconds % size === 0) ?? STEPS[2]
  return `${seconds / size}${code}`
}

/** A duration as written ('24h') or in seconds, kept as written in days, hours or minutes. */
const duration = z.union([z.string().trim().regex(DURATION), z.number().int().min(0)]).transform(v => asDuration(parseDuration(v)))

/** A version's terms (part 2): only the deal type's own fields are checked when it is sent (A2). */
export const termsInput = z.object({
  dealType: z.enum(DEAL_TYPES),
  companyShareBp: z.number().int().min(0).max(10_000).nullable().optional(), // not-policy: basis points in a whole
  shareBasis: z.enum(SHARE_BASES).nullable().optional(),
  guaranteeMinor: money.nullable().optional(),
  hireFeeMinor: money.nullable().optional(),
  hireFeeBasis: z.enum(HIRE_FEE_BASES).nullable().optional(),
  depositMinor: money.default(0),
  guestPlaces: z.number().int().min(0).max(LIMITS.places).optional(),
  guestNamesDue: duration.optional(),
  settleWithin: duration.optional(),
  clauses: z.string().max(20_000).nullable().optional(), // not-policy: the column's bound
})

export const answerInput = z.object({ answer: z.enum(ANSWERS) })
export const recordInput = answerInput.extend({ responderId: z.string().min(1), onBehalfOf: z.string().trim().max(LIMITS.personName).optional() })

const COLUMNS = `id, engagement_id AS engagementId, version, deal_type AS dealType, company_share_bp AS companyShareBp, share_basis AS shareBasis,
  guarantee_minor AS guaranteeMinor, hire_fee_minor AS hireFeeMinor, hire_fee_basis AS hireFeeBasis, guest_places AS guestPlaces,
  guest_names_due AS guestNamesDue, state, created_by AS createdBy`

export async function requireAgreement(id: string, engagementId?: string): Promise<Agreement> {
  const agreement = await first<Agreement>(`SELECT ${COLUMNS} FROM companies_agreements WHERE id = ?`, id)
  if (!agreement || (engagementId && agreement.engagementId !== engagementId)) refuse('core.not-found', 'There is no such agreement.', { status: 404 })
  return agreement!
}

/** Who is acting, in which unit, on which engagement: what every step below is given first. */
export interface Step { unit: UnitOfWork, actor: Actor, engagement: Engagement }

function history(unit: UnitOfWork, actor: Actor, row: { engagementId: string, kind: string, from?: string | null, to?: string | null, agreementId: string }) {
  const at = nowMs()
  unit.add({
    sql: 'INSERT INTO companies_engagement_events (id, engagement_id, kind, from_state, to_state, detail, actor_id, at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [newId('cpev'), row.engagementId, row.kind, row.from ?? null, row.to ?? null, JSON.stringify({ agreementId: row.agreementId }), actor.accountId ?? null, at, at],
  })
}

/** Moves the engagement when its state is the one given; otherwise leaves it (renegotiating a confirmed engagement does not move it). */
function moveIf({ unit, actor, engagement }: Step, move: { from: string, to: string, agreementId: string }) {
  const { from, to, agreementId } = move
  if (engagement.state !== from) return
  unit.add({ sql: 'UPDATE companies_engagements SET state = ?, updated_at = ? WHERE id = ? AND state = ?', params: [to, nowMs(), engagement.id, from] })
    .expect(1, { code: 'companies.engagement.changed-elsewhere', reason: 'Someone changed this engagement just now.', remedy: 'Reload the page.' })
  history(unit, actor, { engagementId: engagement.id, kind: 'moved', from, to, agreementId })
  unit.announce('companies.engagement.changed', { engagementId: engagement.id, from: from as Engagement['state'], to: to as Engagement['state'] }, { record: ['companies.engagement', engagement.id] })
}

/** The terms' columns in the insert's order, a field left out taking the theatre's setting. */
async function termValues(input: z.infer<typeof termsInput>): Promise<unknown[]> {
  const places = input.guestPlaces ?? await useSetting('companies.guests.default-places') as number
  const namesDue = input.guestNamesDue ?? asDuration(await useSetting('companies.guests.names-due') as number)
  const settle = input.settleWithin ?? asDuration(await useSetting('companies.settlements.due-within') as number)
  const clauses = input.clauses ?? await useSetting('companies.agreements.default-clauses') as string | null
  return [input.dealType, input.companyShareBp ?? null, input.shareBasis ?? null, input.guaranteeMinor ?? null, input.hireFeeMinor ?? null,
    input.hireFeeBasis ?? null, input.depositMinor, places, namesDue, settle, clauses ?? null]
}

/**
 * Rule A1: new terms are a new version. A draft or sent version it replaces is superseded at once; an
 * accepted one stays the one that applies until the new version is accepted (A5).
 */
export async function draftAgreement(unit: UnitOfWork, actor: Actor, engagement: Engagement, input: z.infer<typeof termsInput>): Promise<string> {
  if (['cancelled', 'settled'].includes(engagement.state)) refuse('companies.engagement.wrong-state', `This engagement is ${engagement.state}.`, { status: 409, remedy: 'Open a new engagement instead.' })
  const latest = await first<{ id: string, version: number, state: string }>('SELECT id, version, state FROM companies_agreements WHERE engagement_id = ? ORDER BY version DESC LIMIT 1', engagement.id)
  const id = newId('cpa')
  const version = (latest?.version ?? 0) + 1
  unit.add({
    sql: `INSERT INTO companies_agreements (id, engagement_id, version, supersedes_id, deal_type, company_share_bp, share_basis, guarantee_minor, hire_fee_minor, hire_fee_basis,
            deposit_minor, guest_places, guest_names_due, settle_within, clauses, state, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    params: [id, engagement.id, version, latest?.id ?? null, ...await termValues(input), actor.accountId ?? null, nowMs()],
  })
  if (latest && ['draft', 'sent'].includes(latest.state))
    unit.add({ sql: 'UPDATE companies_agreements SET state = \'superseded\' WHERE id = ? AND state = ?', params: [latest.id, latest.state] })
      .expect(1, { code: 'companies.agreement.changed-elsewhere', reason: 'Someone changed this agreement just now.', remedy: 'Reload the page.' })
  if (latest?.state === 'sent') history(unit, actor, { engagementId: engagement.id, kind: 'agreement-superseded', agreementId: latest.id })
  unit.audit({ action: 'create', record: ['companies.agreement', id], detail: { version } })
  return id
}

/** Rule A2: what the deal type needs before the version can go. */
function missingTerms(a: Agreement): string | null {
  const split = ['split', 'guarantee-or-split'].includes(a.dealType)
  if (split && (a.companyShareBp === null || a.shareBasis === null)) return 'A split needs the company\'s share and what it is worked out from.'
  if (['guarantee', 'guarantee-or-split'].includes(a.dealType) && a.guaranteeMinor === null) return 'A guarantee needs its amount.'
  if (a.dealType === 'hire' && (a.hireFeeMinor === null || a.hireFeeBasis === null)) return 'A hire needs its fee and what it is charged by.'
  return null
}

/** Rule A2: sends a draft to the contacts set to receive agreements, and moves an enquiry to offered. */
export async function sendAgreement(unit: UnitOfWork, actor: Actor, engagement: Engagement, agreement: Agreement): Promise<void> {
  if (agreement.state !== 'draft') refuse('companies.agreement.wrong-state', `This version is ${agreement.state}, so it cannot be sent.`, { status: 409, remedy: 'Reload the page.' })
  const missing = missingTerms(agreement)
  if (missing) refuse('companies.agreement.terms-missing', missing, { status: 422, remedy: 'Fill in the terms for this deal type, then send it.' })
  const contacts = await all<{ account_id: string }>('SELECT k.account_id FROM companies_contacts k WHERE k.company_id = ? AND k.ended_at IS NULL AND EXISTS (SELECT 1 FROM json_each(k.receives) r WHERE r.value = \'agreement\')', engagement.companyId)
  if (!contacts.length) refuse('companies.agreement.no-recipient', 'No contact of this company is set to receive agreements.', { status: 422, remedy: 'Add a contact, or set one to receive agreements.' })
  const at = nowMs()
  unit.add({ sql: 'UPDATE companies_agreements SET state = \'sent\', sent_at = ? WHERE id = ? AND state = \'draft\'', params: [at, agreement.id] })
    .expect(1, { code: 'companies.agreement.changed-elsewhere', reason: 'Someone changed this agreement just now.', remedy: 'Reload the page.' })
  history(unit, actor, { engagementId: engagement.id, kind: 'agreement-sent', agreementId: agreement.id })
  moveIf({ unit, actor, engagement }, { from: 'enquiry', to: 'offered', agreementId: agreement.id })
  await notify(unit, 'companies.agreement-sent', {
    to: contacts.map(c => c.account_id),
    variables: { company: engagement.companyPublicName, title: engagement.title, version: String(agreement.version) },
    subject: ['companies.engagement', engagement.id],
    dedupeKey: `companies:agreement-sent:${agreement.id}`,
  })
}

/** Rule A6: a sent version may be withdrawn until it is answered; the engagement goes back to enquiry. */
export function withdrawAgreement(unit: UnitOfWork, actor: Actor, engagement: Engagement, agreement: Agreement): void {
  if (!['draft', 'sent'].includes(agreement.state)) refuse('companies.agreement.wrong-state', `This version is ${agreement.state}, so it cannot be withdrawn.`, { status: 409, remedy: 'Reload the page.' })
  unit.add({ sql: 'UPDATE companies_agreements SET state = \'withdrawn\' WHERE id = ? AND state = ?', params: [agreement.id, agreement.state] })
    .expect(1, { code: 'companies.agreement.answered', reason: 'The company answered this version just now.', remedy: 'Reload the page to see their answer.' })
  if (agreement.state === 'sent') {
    history(unit, actor, { engagementId: engagement.id, kind: 'agreement-withdrawn', agreementId: agreement.id })
    moveIf({ unit, actor, engagement }, { from: 'offered', to: 'enquiry', agreementId: agreement.id })
  }
}

interface Answer { answer: typeof ANSWERS[number], responderId: string, recordedBy?: string | null, onBehalfOf?: string | null }

/**
 * Rule A3: a sent version is answered once, the response's unique index deciding a race. Accepting moves
 * an offer to agreed, supersedes the version accepted before (A5) and makes the guest places (A4);
 * declining moves it back to enquiry.
 */
export async function answerAgreement(step: Step, agreement: Agreement, answer: Answer): Promise<void> {
  const { unit, actor, engagement } = step
  if (agreement.state !== 'sent') refuse('companies.agreement.wrong-state', `This version is ${agreement.state}, so it cannot be answered.`, { status: 409, remedy: 'Reload the page to see the latest version.' })
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO companies_agreement_responses (id, agreement_id, answer, responder_id, on_behalf_of, recorded_by, at, created_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM companies_agreement_responses WHERE agreement_id = ?)`,
    params: [newId('cpar'), agreement.id, answer.answer, answer.responderId, answer.onBehalfOf ?? null, answer.recordedBy ?? null, at, at, agreement.id],
  }).expect(1, { code: 'companies.agreement.answered', reason: 'This version has already been answered.', remedy: 'Reload the page to see the answer.' })
  unit.add({ sql: 'UPDATE companies_agreements SET state = ? WHERE id = ? AND state = \'sent\'', params: [answer.answer, agreement.id] })
    .expect(1, { code: 'companies.agreement.changed-elsewhere', reason: 'This version was withdrawn or replaced just now.', remedy: 'Reload the page.' })
  history(unit, actor, { engagementId: engagement.id, kind: 'agreement-answered', to: answer.answer, agreementId: agreement.id })
  if (answer.answer === 'declined') return moveIf({ unit, actor, engagement }, { from: 'offered', to: 'enquiry', agreementId: agreement.id })
  unit.add({ sql: 'UPDATE companies_agreements SET state = \'superseded\' WHERE engagement_id = ? AND state = \'accepted\' AND id <> ?', params: [engagement.id, agreement.id] })
  moveIf({ unit, actor, engagement }, { from: 'offered', to: 'agreed', agreementId: agreement.id })
  await makeAllocations(unit, engagement, agreement)
}

/** Rule A4: one allocation per performance yet to come, due the version's notice before it starts; a later version changes open ones, never below those named. */
async function makeAllocations(unit: UnitOfWork, engagement: Engagement, agreement: Agreement): Promise<void> {
  if (!engagement.productionId) return
  const dueMs = parseDuration(agreement.guestNamesDue) * 1000 // not-policy: seconds to milliseconds
  const performances = await all<{ id: string, starts_at: number }>(`SELECT id, starts_at FROM core_performances p WHERE production_id = ? AND state <> 'cancelled' AND starts_at > ?
    AND NOT EXISTS (SELECT 1 FROM companies_allocations a WHERE a.engagement_id = ? AND a.performance_id = p.id)`, engagement.productionId, nowMs(), engagement.id)
  unit.add({ sql: 'UPDATE companies_allocations SET places = max(named, ?), updated_at = ? WHERE engagement_id = ? AND state = \'open\'', params: [agreement.guestPlaces, nowMs(), engagement.id] })
  if (agreement.guestPlaces > 0 && performances.length)
    unit.insertSet(allocationsTable, performances.map(p => ({ engagementId: engagement.id, performanceId: p.id, places: agreement.guestPlaces, namesDueAt: p.starts_at - dueMs })))
}

/** CO-21: an answer given on paper, for a live contact. The ability refuses the version's author (owner: refuses), so the sender cannot record their own. */
export async function recordAnswer(step: Step, agreement: Agreement, input: z.infer<typeof recordInput>): Promise<void> {
  const { actor, engagement } = step
  if (!(await isLiveContact(engagement.companyId, input.responderId)))
    refuse('companies.agreement.not-a-contact', 'The person who answered must be a contact of the company.', { status: 422, fields: { responderId: 'Pick one of the company\'s contacts.' } })
  await answerAgreement(step, agreement, { answer: input.answer, responderId: input.responderId, recordedBy: actor.accountId ?? null, onBehalfOf: input.onBehalfOf ?? null })
}

/** Every version of an engagement's agreement, newest first, with its answer. */
export async function agreementVersions(engagementId: string): Promise<AgreementVersion[]> {
  const rows = await all<Omit<AgreementVersion, 'guestNamesDue' | 'settleWithin' | 'onPaper'> & { guestNamesDue: string, settleWithin: string, onPaper: number }>(`SELECT a.id, a.version, a.deal_type AS dealType, a.company_share_bp AS companyShareBp, a.share_basis AS shareBasis, a.guarantee_minor AS guaranteeMinor,
      a.hire_fee_minor AS hireFeeMinor, a.hire_fee_basis AS hireFeeBasis, a.deposit_minor AS depositMinor, a.guest_places AS guestPlaces,
      a.guest_names_due AS guestNamesDue, a.settle_within AS settleWithin, a.clauses, a.state, a.sent_at AS sentAt, a.created_at AS createdAt,
      r.answer, r.at AS answeredAt, r.recorded_by IS NOT NULL AS onPaper,
      (SELECT CASE WHEN x.anonymised_at IS NOT NULL THEN 'Former member' ELSE coalesce(nullif(x.name, ''), 'Unnamed person') END FROM core_accounts x WHERE x.id = r.responder_id) AS responder
    FROM companies_agreements a LEFT JOIN companies_agreement_responses r ON r.agreement_id = a.id WHERE a.engagement_id = ? ORDER BY a.version DESC`, engagementId)
  return rows.map(r => ({ ...r, guestNamesDue: parseDuration(r.guestNamesDue), settleWithin: parseDuration(r.settleWithin), onPaper: !!r.onPaper }))
}
