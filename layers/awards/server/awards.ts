// Awards: one person holding one award type. An award is current until it is revoked; nothing has
// to run for it to stay so, and it has no end date.
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import type { PRECISIONS, SOURCES } from './db/schema'
import { VISIBILITIES } from './db/schema'
import type { AwardType } from './types'

export interface Award {
  id: string
  typeId: string
  typeName: string
  accountId: string | null
  recipientName: string
  awardedOn: string
  /** Whether awardedOn is known to the day or only to the year. */
  awardedPrecision: typeof PRECISIONS[number]
  awardedFor: string | null
  citation: string | null
  productionId: string | null
  decidedOn: string | null
  decisionNote: string | null
  source: typeof SOURCES[number]
  visibility: typeof VISIBILITIES[number]
  /** Left off the roll until the holder (or staff) chooses where it is listed. */
  listingPending: boolean
  state: 'current' | 'revoked'
  revokedAt: number | null
  revokeReason: string | null
}

const COLUMNS = `a.id, a.type_id AS typeId, t.name AS typeName, a.account_id AS accountId, a.recipient_name AS recipientName, a.awarded_on AS awardedOn, a.awarded_precision AS awardedPrecision,
  a.awarded_for AS awardedFor, a.citation, a.production_id AS productionId, a.decided_on AS decidedOn, a.decision_note AS decisionNote, a.source,
  a.visibility, a.listing_pending AS listingPending, a.state, a.revoked_at AS revokedAt, a.revoke_reason AS revokeReason`
const FROM = 'FROM awards_awards a JOIN awards_types t ON t.id = a.type_id'

export async function getAward(id: string | undefined): Promise<Award | null> {
  return id ? first<Award>(`SELECT ${COLUMNS} ${FROM} WHERE a.id = ?`, id) : null
}

export async function requireAward(id: string | undefined): Promise<Award> {
  const award = await getAward(id)
  if (!award) refuse('core.not-found', 'There is no such award.', { status: 404 })
  return award!
}

export interface AwardFilter { typeId?: string, state?: 'current' | 'revoked', q?: string }

/** Awards for the console's list, newest first. */
export async function listAwards(filter: AwardFilter = {}): Promise<Award[]> {
  const parts: [string, unknown][] = []
  if (filter.typeId) parts.push(['a.type_id = ?', filter.typeId])
  if (filter.state) parts.push(['a.state = ?', filter.state])
  if (filter.q?.trim()) parts.push(['a.recipient_name LIKE \'%\' || ? || \'%\'', filter.q.trim()])
  const where = parts.map(p => p[0])
  const params = parts.map(p => p[1])
  return all<Award>(`${`SELECT ${COLUMNS} ${FROM}`} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.awarded_on DESC, a.id DESC LIMIT 500`, ...params) // not-policy: more than a theatre gives
}

/** Every award of one person, through the account scope, newest first. */
export async function awardsOf(accountId: string): Promise<Award[]> {
  return all<Award>(`SELECT ${COLUMNS} ${FROM} WHERE a.account_id IN (${accountScopeSql('?1')}) ORDER BY a.awarded_on DESC, a.id DESC`, accountId)
}

/** Whether the person holds a current award of the type. */
export async function holdsType(accountId: string, typeId: string): Promise<boolean> {
  return !!(await first(`SELECT 1 FROM awards_awards a WHERE a.account_id IN (${accountScopeSql('?1')}) AND a.type_id = ?2 AND a.state = 'current' LIMIT 1`, accountId, typeId))
}

/** Everybody holding a current award of a type. Survivors only: a merged account's award counts for its survivor. */
export async function holders(typeId: string): Promise<string[]> {
  const rows = await all<{ id: string }>(
    'SELECT DISTINCT coalesce(c.merged_into_id, c.id) AS id FROM awards_awards a JOIN core_accounts c ON c.id = a.account_id WHERE a.type_id = ? AND a.state = \'current\' ORDER BY 1',
    typeId,
  )
  return rows.map(r => r.id)
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // not-policy: the shape of a date

/** What staff may say about an award, when issuing it or correcting it. */
export const awardFields = z.object({
  recipientName: z.string().trim().min(1).max(120), // not-policy: the table's bound
  awardedOn: DATE,
  awardedFor: z.string().trim().max(200).nullable(), // not-policy: one short line
  citation: z.string().trim().max(2000).nullable(), // not-policy: a few sentences
  productionId: z.string().nullable(),
  decidedOn: DATE.nullable(),
  decisionNote: z.string().trim().max(500).nullable(), // not-policy: a reference, not minutes
  visibility: z.enum(VISIBILITIES),
})

export interface NewAward {
  type: AwardType
  accountId: string | null
  recipientName: string
  awardedOn: string
  awardedPrecision?: typeof PRECISIONS[number]
  awardedFor?: string | null
  citation?: string | null
  productionId?: string | null
  decidedOn?: string | null
  decisionNote?: string | null
  visibility?: typeof VISIBILITIES[number]
  source: typeof SOURCES[number]
  /** The forms response a nomination's award came from. */
  responseId?: string | null
  issuedBy: string | null
}

/**
 * Adds an award to the caller's unit. Where the type is held once, the insert carries the condition
 * that the person holds no current one, through the account scope, so two requests at once cannot
 * both succeed.
 */
export function writeAward(unit: UnitView, input: NewAward): string {
  const id = newId('awd')
  const at = nowMs()
  const once = input.type.onePerPerson && input.accountId
  const held = once ? ` AND NOT EXISTS (SELECT 1 FROM awards_awards WHERE type_id = ?2 AND state = 'current' AND account_id IN (${accountScopeSql('?3')}))` : '' // not-policy: numbered parameters
  const sql = `INSERT INTO awards_awards (id, type_id, account_id, recipient_name, awarded_on, awarded_for, citation, production_id, decided_on, decision_note, source, visibility, state, issued_by, created_at, updated_at, response_id, awarded_precision) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'current', ?13, ?14, ?14, ?15, ?16 WHERE (SELECT state FROM awards_types WHERE id = ?2) = 'active'${held}` // not-policy: numbered parameters
  unit.add({
    sql,
    params: [id, input.type.id, input.accountId, input.recipientName, input.awardedOn, input.awardedFor ?? null, input.citation ?? null, input.productionId ?? null,
      input.decidedOn ?? null, input.decisionNote ?? null, input.source, input.visibility ?? input.type.defaultVisibility, input.issuedBy, at, input.responseId ?? null, input.awardedPrecision ?? 'day'],
  }).expect(1, once
    ? { code: 'awards.award.already-held', reason: `This person already holds ${input.type.name}.`, remedy: 'Open their award to correct it instead.' }
    : { code: 'awards.type.archived', reason: `${input.type.name} is archived, so it cannot be given.`, remedy: 'Restore the award first.' })
  unit.announce('awards.award.issued', { awardId: id, typeId: input.type.id }, { record: ['awards.award', id] })
  return id
}
