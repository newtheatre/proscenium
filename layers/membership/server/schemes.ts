// Schemes and their length options (Membership specification, tab 2 and tab 3, S1 to S5).
import { z } from 'zod'
import { all, first, refuse, useSetting } from '#kit'
import { endsOnFor } from './dates'
import { hasListKey, schemeList } from './lists'
import { JOIN_MODES, LENGTH_RULES, SIDES } from './db/schema'

export interface Scheme {
  id: string
  key: string
  name: string
  summary: string | null
  side: 'members' | 'audience'
  state: 'draft' | 'open' | 'closed' | 'archived'
  joinMode: 'apply' | 'staff-only'
  lengthRule: 'fixed' | 'rolling' | 'indefinite'
  fixedEndMonth: number | null
  fixedEndDay: number | null
  rolloverDays: number
  renewalOpensDays: number
  graceDays: number
  verifier: string | null
  verifierConfig: string | null
  reverifyOnRenewal: boolean
  needsApproval: boolean
  requiresPayment: boolean
  voting: boolean
  acceptsReference: boolean
  holderMayEnd: boolean
  position: number
}

export interface LengthOption { id: string, name: string, count: number, state: 'offered' | 'withdrawn', position: number }

const COLUMNS = `id, key, name, summary, side, state, join_mode AS joinMode, length_rule AS lengthRule, fixed_end_month AS fixedEndMonth,
  fixed_end_day AS fixedEndDay, rollover_days AS rolloverDays, renewal_opens_days AS renewalOpensDays, grace_days AS graceDays,
  verifier, verifier_config AS verifierConfig, reverify_on_renewal AS reverifyOnRenewal, needs_approval AS needsApproval, requires_payment AS requiresPayment,
  voting, accepts_reference AS acceptsReference, holder_may_end AS holderMayEnd, position`
const BOOLEANS = ['reverifyOnRenewal', 'needsApproval', 'requiresPayment', 'voting', 'acceptsReference', 'holderMayEnd'] as const

function toScheme(row: Record<string, unknown>): Scheme {
  const out = { ...row } as Record<string, unknown>
  for (const key of BOOLEANS) out[key] = !!row[key]
  return out as unknown as Scheme
}

export async function getScheme(id: string): Promise<Scheme | null> {
  const row = await first<Record<string, unknown>>(`SELECT ${COLUMNS} FROM membership_schemes WHERE id = ?`, id)
  return row ? toScheme(row) : null
}

export async function requireScheme(id: string | undefined): Promise<Scheme> {
  const scheme = id ? await getScheme(id) : null
  if (!scheme) refuse('core.not-found', 'There is no such scheme.', { status: 404 })
  return scheme!
}

export async function listSchemes(states?: readonly Scheme['state'][]): Promise<Scheme[]> {
  const where = states ? `WHERE state IN (${states.map(() => '?').join(', ')})` : ''
  return (await all<Record<string, unknown>>(`SELECT ${COLUMNS} FROM membership_schemes ${where} ORDER BY position, name`, ...(states ?? []))).map(toScheme)
}

export async function lengthOptions(schemeIds: readonly string[], onlyOffered = false): Promise<Map<string, LengthOption[]>> {
  const out = new Map<string, LengthOption[]>(schemeIds.map(id => [id, []]))
  if (!schemeIds.length) return out
  const rows = await all<LengthOption & { schemeId: string }>(
    `SELECT id, scheme_id AS schemeId, name, count, state, position FROM membership_length_options
      WHERE scheme_id IN (SELECT value FROM json_each(?)) ${onlyOffered ? "AND state = 'offered'" : ''} ORDER BY position, count`,
    JSON.stringify(schemeIds),
  )
  for (const { schemeId, ...option } of rows) out.get(schemeId)!.push(option)
  return out
}

export const KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/ // not-policy: the shape of an address part

/** The fields staff set on a scheme. Each one starts from a setting where the specification says so. */
export const schemeFields = z.object({
  key: z.string().trim().min(1).max(60).regex(KEY), // not-policy: the shape of an address part
  name: z.string().trim().min(1).max(80), // not-policy: the specification's bound
  summary: z.string().trim().max(500).nullable(), // not-policy: the specification's bound
  side: z.enum(SIDES),
  joinMode: z.enum(JOIN_MODES),
  lengthRule: z.enum(LENGTH_RULES),
  fixedEndMonth: z.number().int().min(1).max(12).nullable(), // not-policy: the calendar
  fixedEndDay: z.number().int().min(1).max(31).nullable(), // not-policy: the calendar
  rolloverDays: z.number().int().min(0).max(180), // not-policy: the specification's bound
  renewalOpensDays: z.number().int().min(0).max(180), // not-policy: the specification's bound
  graceDays: z.number().int().min(0).max(90), // not-policy: the specification's bound
  reverifyOnRenewal: z.boolean(),
  needsApproval: z.boolean(),
  requiresPayment: z.boolean(),
  voting: z.boolean(),
  acceptsReference: z.boolean(),
  holderMayEnd: z.boolean(),
  // The verifier and its configuration. The list verifier is the only one so far.
  verifier: z.enum(['membership.list']).nullable(),
  listId: z.string().nullable(),
})
export type SchemeFields = z.infer<typeof schemeFields>

/** Refuses a fixed end date that is missing, out of place or impossible; 29 February is refused. */
export function checkLengthRule(fields: Pick<SchemeFields, 'lengthRule' | 'fixedEndMonth' | 'fixedEndDay'>): void {
  const fixed = fields.lengthRule === 'fixed'
  if (fixed !== (fields.fixedEndMonth != null && fields.fixedEndDay != null))
    refuse('membership.scheme.fixed-end', fixed ? 'A fixed-date scheme needs the day and month it ends.' : 'Only a fixed-date scheme has an end day and month.', { status: 422, fields: { fixedEndDay: 'membership.scheme.fixed-end' } })
  if (fixed) {
    const most = fields.fixedEndMonth === 2 ? 28 : [4, 6, 9, 11].includes(fields.fixedEndMonth!) ? 30 : 31 // not-policy: days in each month
    if (fields.fixedEndDay! > most)
      refuse('membership.scheme.fixed-end-day', fields.fixedEndMonth === 2 ? 'A scheme cannot end on 29 February. Choose 28 February or 1 March.' : 'That month does not have that many days.', { status: 422, fields: { fixedEndDay: 'membership.scheme.fixed-end-day' } })
  }
}

/** The starting values of a new scheme that come from settings (tab 6, "Scheme fields that start from a setting"). */
export async function schemeDefaults(): Promise<Pick<SchemeFields, 'renewalOpensDays' | 'graceDays' | 'holderMayEnd'>> {
  const days = (seconds: unknown) => Math.round(Number(seconds) / 86400) // not-policy: seconds in a day
  return {
    renewalOpensDays: days(await useSetting('membership.renewal.opens-before')),
    graceDays: days(await useSetting('membership.renewal.grace')),
    holderMayEnd: !!(await useSetting('membership.ending.by-holder')),
  }
}

export interface ChecklistItem { code: string, done: boolean }

/**
 * What opening a scheme needs (rule S4, and the rule that a members' scheme needs the members'
 * area). Verifiers, application forms and fees are later slices: until they exist, a scheme that
 * asks for any of them cannot be opened, and the checklist says why.
 */
export async function openChecklist(scheme: Scheme): Promise<ChecklistItem[]> {
  const options = (await lengthOptions([scheme.id], true)).get(scheme.id)!
  const items: ChecklistItem[] = []
  if (scheme.lengthRule !== 'indefinite') items.push({ code: 'length-option', done: options.length > 0 })
  if (scheme.side === 'members') items.push({ code: 'members-area', done: !!(await useSetting('core.members-area.enabled')) })
  // The list verifier is the one so far: it needs its list and the key the list is hashed with.
  if (scheme.verifier) items.push({ code: 'verifier', done: scheme.verifier === 'membership.list' && !!(await schemeList(scheme)) && await hasListKey() })
  if (scheme.needsApproval) items.push({ code: 'application-form', done: false })
  if (scheme.requiresPayment) items.push({ code: 'price', done: false })
  return items
}

/** The dates a membership taken today would run to, one for each offered length: the scheme screen's live example. */
export function exampleDates(scheme: Scheme, options: LengthOption[], today: string): { lengthOptionId: string | null, startsOn: string, endsOn: string | null }[] {
  if (scheme.lengthRule === 'indefinite') return [{ lengthOptionId: null, startsOn: today, endsOn: null }]
  return options.filter(o => o.state === 'offered').map(o => ({ lengthOptionId: o.id, startsOn: today, endsOn: endsOnFor(scheme, today, o.count) }))
}

/** Whether any membership, in any state, names the scheme: its side is then fixed (S2) and it cannot be deleted (S1). */
export async function hasMemberships(schemeId: string): Promise<boolean> {
  return !!(await first('SELECT 1 FROM membership_memberships WHERE scheme_id = ? LIMIT 1', schemeId))
}
