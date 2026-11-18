// Using a pass (BO-64; mock-up approved by Matt 2026-11-18). A pass gives one entry at a performance
// it covers: a ticket on a reservation, at no charge, added by the pass's code. The code is typed
// online or scanned at the desk; several passes may go on one reservation, one entry each. A
// wheelchair space is still one entry, though it takes the room the layout says. The entry is a
// redemption tied to the ticket's seat, written in the claim batch: the guard is on the statement,
// and behind it the pass's CHECK and the redemptions' unique indexes hold the allowance, one entry a
// performance and, for a pass of that kind, one performance of a show. A seat given back gives the
// entry back.
import { sql } from 'drizzle-orm'
import { all, first, isRefusal, newId, nowMs, openColumn, refuse, requirements, theatreTimeZone, useSetting, type UnitView } from '#kit'
import { accountScopeIds, accountScopeSql } from '#kit/accounts'
import { accountLabel, getPerformance, getProduction } from '#modules/core'
import { hashOf } from './codes'
import { passCodeHashes, shownPassCode } from './pass-holding'
import { HIDDEN_TYPE, managedType } from './ticket-types'

/** The ticket type Box office keeps for a pass entry's line. It is never listed, priced or sold. */
export const PASS_ENTRY_TYPE = HIDDEN_TYPE

export interface PassAsk {
  /** The pass's code, as typed or scanned. */
  code: string
  /** The part of the house, where there is more than one; the first with room otherwise. */
  bandId?: string
  /** The holder will use a wheelchair space: still one entry. */
  wheelchair?: boolean
}

export interface JudgedPass {
  passId: string
  passTypeId: string
  name: string
  priceName: string
  accountId: string | null
  named: boolean
  once: boolean
  /** What is still to pay for the pass itself, or 0. */
  owedMinor: number
  /** How many entries it has left in all, or null for no limit. */
  left: number | null
}

interface Row { id: string, pass_type_id: string, name: string, price_name: string, requirement_refs: string | null, account_id: string | null, named: number, once: number, uses_total: number | null, uses_taken: number, amount_minor: number, issued_at: number | null, paid_at: number | null, state: string, order_line_id: string | null, covers: 'productions' | 'season' | 'dates', season_id: string | null, covers_from: number | null, covers_until: number | null, reserve_unpaid: number, recheck: number }

const field = (reason: string) => ({ pass: reason })

/**
 * The pass a buyer typed, judged for a performance at a moment: the pass, or a refusal that says
 * which of unknown, not for this show, already used, used up, not paid for or not theirs it is.
 * `ownOrderId` lets a pass made in the same basket through, before it is anyone's.
 */
export async function judgePass(typed: string, performanceId: string, buyer: { channel: 'online' | 'desk', account: string | null }, at = nowMs(), ownOrderId?: string): Promise<JudgedPass> {
  const row = await first<Row>(
    `SELECT p.id, p.pass_type_id, t.name, r.name AS price_name, r.requirement_refs, p.account_id, p.named, p.once, p.uses_total, p.uses_taken, p.amount_minor, p.issued_at, p.paid_at, p.state, p.order_line_id,
        t.covers, t.season_id, t.covers_from, t.covers_until, t.reserve_unpaid, t.recheck
      FROM box_office_passes p JOIN box_office_pass_types t ON t.id = p.pass_type_id JOIN box_office_pass_prices r ON r.id = p.pass_price_id WHERE p.code_hash = ? OR p.alias_hash = ?`, ...await passCodeHashes(typed))
  const own = row && !row.issued_at && ownOrderId && await first('SELECT 1 AS one FROM box_office_order_lines WHERE id = ? AND order_id = ?', row.order_line_id, ownOrderId)
  if (!row || (!row.issued_at && !own))
    refuse('box-office.pass.unknown', 'We do not recognise that pass code.', { status: 422, remedy: 'Check how it is spelt. It is on the pass and in its email.', fields: field('unknown') })
  if (row.state !== 'active') refuse('box-office.pass.void', 'That pass has been cancelled.', { status: 422, remedy: 'Ask the box office if you think that is wrong.', fields: field('void') })

  const performance = await getPerformance(performanceId)
  const production = await getProduction(performance.productionId)
  const inDates = (row.covers_from === null || performance.startsAt >= row.covers_from) && (row.covers_until === null || performance.startsAt < row.covers_until)
  const covered = inDates && (row.covers === 'dates'
    || (row.covers === 'season' && production.seasonId === row.season_id)
    || (row.covers === 'productions' && !!await first('SELECT 1 AS one FROM box_office_pass_shows WHERE pass_type_id = ? AND production_id = ?', row.pass_type_id, production.id)))
  if (!covered) refuse('box-office.pass.not-covered', `${row.name} does not cover this ${inDates ? 'show' : 'performance'}.`, { status: 422, remedy: 'Choose tickets below instead.', fields: field('not-covered') })

  // In one person's name: online, only they use it; at the desk the seller has it in front of them.
  if (row.named && buyer.channel === 'online') {
    const scope = buyer.account ? await accountScopeIds(buyer.account) : []
    if (!buyer.account) refuse('box-office.pass.sign-in', 'That pass is in one person\'s name.', { status: 403, remedy: 'Sign in to use it, or bring it to the box office.', fields: field('sign-in') })
    if (!scope.includes(row.account_id!)) refuse('box-office.pass.not-yours', 'That pass is in someone else\'s name.', { status: 403, remedy: 'They can book with it themselves, or bring it to the box office.', fields: field('not-yours') })
  }
  // A price only some people may buy, checked again where the pass says to: a lapsed membership stops it.
  if (row.recheck && row.requirement_refs && row.account_id) {
    const refs = JSON.parse(row.requirement_refs) as string[]
    const answers = refs.length ? await requirements.check({ accounts: [row.account_id], refs, record: ['core.performance', performanceId], whenUnavailable: 'not-met' }) : []
    if (refs.length && !answers.some(a => a.verdict === 'met' && !a.unavailable))
      refuse('box-office.pass.lapsed', answers.find(a => !a.unavailable && a.reason)?.reason ?? `This pass was bought at the ${row.price_name} price, which its holder no longer qualifies for.`, { status: 403, remedy: 'Ask the box office.', fields: field('lapsed') })
  }

  const used = await all<{ performance_id: string, production_id: string, order_id: string, basket: number }>(
    `SELECT d.performance_id, d.production_id, d.order_id, (o.state = 'basket') AS basket FROM box_office_pass_redemptions d JOIN box_office_orders o ON o.id = d.order_id
      WHERE d.pass_id = ? AND d.state = 'live' AND NOT (o.state = 'basket' AND o.expires_at <= ?)`, row.id, at)
  // Entries held by a basket are let go when this one is held (letGoBaskets), so they do not count here.
  const kept = used.filter(u => !u.basket)
  if (kept.some(u => u.performance_id === performanceId))
    refuse('box-office.pass.used-here', 'This pass already has a ticket for this performance.', { status: 409, remedy: 'Each pass gives one entry. Choose tickets below for anyone else.', fields: field('used-here') })
  const earlier = row.once ? kept.find(u => u.production_id === production.id) : undefined
  if (earlier) {
    const when = new Intl.DateTimeFormat((await useSetting('core.locale.language') as string | null) ?? 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: await theatreTimeZone() }).format((await getPerformance(earlier.performance_id)).startsAt)
    refuse('box-office.pass.used-show', `This pass has already been used for ${production.title}. It covers one performance of each show.`, { status: 409, remedy: `Its ticket is for ${when}. Cancel that ticket to come on this date instead.`, fields: field('used-show') })
  }
  if (row.uses_total !== null && kept.length >= row.uses_total)
    refuse('box-office.pass.used-up', 'This pass has no entries left.', { status: 409, remedy: 'Choose tickets below instead.', fields: field('used-up') })

  return {
    passId: row.id, passTypeId: row.pass_type_id, name: row.name, priceName: row.price_name, accountId: row.account_id, named: !!row.named, once: !!row.once,
    owedMinor: row.paid_at ? 0 : row.amount_minor, left: row.uses_total === null ? null : row.uses_total - kept.length,
  }
}

/** Every pass asked for, judged; the same pass twice is refused, since each gives one entry. */
export async function judgePasses(asks: readonly PassAsk[], performanceId: string, buyer: { channel: 'online' | 'desk', account: string | null }, at = nowMs(), ownOrderId?: string): Promise<JudgedPass[]> {
  const out: JudgedPass[] = []
  for (const ask of asks) {
    const judged = await judgePass(ask.code, performanceId, buyer, at, ownOrderId)
    if (out.some(o => o.passId === judged.passId))
      refuse('box-office.pass.repeated', 'The same pass is given twice.', { status: 422, remedy: 'Each pass gives one entry. Add another pass, or choose a ticket.', fields: field('repeated') })
    out.push(judged)
  }
  return out
}

/** The id of the ticket type a pass entry's line carries, made by Box office's own declaration. */
export async function passEntryTypeId(): Promise<string> {
  const type = await managedType(PASS_ENTRY_TYPE)
  if (!type) throw new Error('The pass entry ticket type is missing: ensureManagedTicketTypes has not run')
  return type.id
}

const TAKEN = { code: 'box-office.pass.just-used', reason: 'That pass has just been used for this.', remedy: 'Each pass gives one entry at a performance. Choose a ticket instead.' }

/**
 * Lets go other live baskets that hold an entry of these passes which would stand in the way: the
 * holder who went back and chose again is not told their pass is used by the basket they left.
 * Reservations and paid bookings are never touched.
 */
export async function letGoBaskets(unit: UnitView, passes: readonly JudgedPass[], performanceId: string, productionId: string, at: number): Promise<void> {
  if (!passes.length) return
  const others = await all<{ id: string }>(
    `SELECT DISTINCT o.id FROM box_office_pass_redemptions d JOIN box_office_orders o ON o.id = d.order_id
      WHERE d.state = 'live' AND o.state = 'basket' AND o.expires_at > ?1 AND d.pass_id IN (SELECT value FROM json_each(?2))
        AND (d.performance_id = ?3 OR (d.once = 1 AND d.production_id = ?4) OR EXISTS (SELECT 1 FROM box_office_passes p WHERE p.id = d.pass_id AND p.uses_total IS NOT NULL AND p.uses_taken >= p.uses_total))`, // not-policy: SQL parameter numbers
    at, JSON.stringify(passes.map(p => p.passId)), performanceId, productionId)
  for (const other of others) {
    unit.add({ sql: "UPDATE box_office_orders SET state = 'expired', updated_at = ? WHERE id = ? AND state = 'basket'", params: [at, other.id] })
    unit.add({ sql: "UPDATE box_office_claims SET state = 'released', released_at = ?, release_reason = 'abandoned' WHERE state = 'held' AND hold_id IN (SELECT id FROM box_office_holds WHERE order_id = ? AND kind = 'basket')", params: [at, other.id] })
    unit.announce('box-office.order.expired', { orderId: other.id }, { record: ['box-office.order', other.id] })
  }
}

/**
 * Writes one entry for each pass, tied to its ticket's seat, after the claims. The guard comes
 * first on the statement, so the last entry is given once; the triggers count it.
 */
export function redeemPasses(unit: UnitView, orderId: string, performanceId: string, productionId: string, entries: readonly { pass: JudgedPass, claimId: string }[]): string[] {
  const at = nowMs()
  return entries.map(({ pass, claimId }) => {
    unit.add(sql`UPDATE box_office_passes SET updated_at = ${at} WHERE id = ${pass.passId} AND state = 'active' AND (uses_total IS NULL OR uses_taken < uses_total)
      AND NOT EXISTS (SELECT 1 FROM box_office_pass_redemptions d WHERE d.pass_id = ${pass.passId} AND d.state = 'live' AND (d.performance_id = ${performanceId} OR (d.once = 1 AND d.production_id = ${productionId})))`).expect(1, TAKEN)
    const id = newId('pred')
    unit.add(sql`INSERT INTO box_office_pass_redemptions (id, pass_id, production_id, performance_id, order_id, claim_id, once, state, created_at, updated_at)
      VALUES (${id}, ${pass.passId}, ${productionId}, ${performanceId}, ${orderId}, ${claimId}, ${pass.once ? 1 : 0}, 'live', ${at}, ${at})`)
    return id
  })
}

/**
 * Carries a pass entry onto a new seat when its ticket's line is written again (a reservation split
 * or reinstated): the old seat's release has given the entry back, and this takes it for the new one.
 */
export function carryPassEntry(unit: UnitView, from: { redemptionId: string }, to: { orderId: string, claimId: string }): string {
  const id = newId('pred')
  const at = nowMs()
  unit.add(sql`INSERT INTO box_office_pass_redemptions (id, pass_id, production_id, performance_id, order_id, claim_id, once, state, created_at, updated_at)
    SELECT ${id}, pass_id, production_id, performance_id, ${to.orderId}, ${to.claimId}, once, 'live', ${at}, ${at} FROM box_office_pass_redemptions WHERE id = ${from.redemptionId}`)
    .expect(1, TAKEN)
  return id
}

/**
 * Moves pass entries to other seats at another performance of the same show, in an exchange, in the
 * same batch as their old seats' release (which gives the entries back): each takes its entry again
 * for its new seat, with the same guard as a first entry. Answers the new entry for each old line.
 */
export async function movePassEntries(unit: UnitView, orderId: string, moving: readonly { lineId: string, claimId: string }[], performanceId: string, productionId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!moving.length) return out
  const rows = await all<{ line_id: string, pass_id: string, once: number }>(`SELECT l.id AS line_id, d.pass_id, d.once FROM box_office_order_lines l JOIN box_office_pass_redemptions d ON d.id = l.pass_redemption_id
    WHERE l.order_id = ? AND l.id IN (SELECT value FROM json_each(?))`, orderId, JSON.stringify(moving.map(m => m.lineId)))
  const at = nowMs()
  for (const row of rows) {
    const claimId = moving.find(m => m.lineId === row.line_id)!.claimId
    unit.add(sql`UPDATE box_office_passes SET updated_at = ${at} WHERE id = ${row.pass_id} AND state = 'active' AND (uses_total IS NULL OR uses_taken < uses_total)
      AND NOT EXISTS (SELECT 1 FROM box_office_pass_redemptions d WHERE d.pass_id = ${row.pass_id} AND d.state = 'live' AND (d.performance_id = ${performanceId} OR (d.once = 1 AND d.production_id = ${productionId})))`).expect(1, TAKEN)
    const id = newId('pred')
    unit.add(sql`INSERT INTO box_office_pass_redemptions (id, pass_id, production_id, performance_id, order_id, claim_id, once, state, created_at, updated_at)
      VALUES (${id}, ${row.pass_id}, ${productionId}, ${performanceId}, ${orderId}, ${claimId}, ${row.once}, 'live', ${at}, ${at})`)
    out.set(row.line_id, id)
  }
  return out
}

/**
 * For lines written again on new seats, in the same batch as their old seats' release: each line
 * that was a pass entry takes its entry again for its new seat, and its new line points at it.
 */
export async function carryPassEntries(unit: UnitView, orderId: string, moved: readonly { lineId: string, claimId: string }[]): Promise<void> {
  if (!moved.length) return
  const entries = new Map((await all<{ id: string, pass_redemption_id: string }>(
    'SELECT id, pass_redemption_id FROM box_office_order_lines WHERE pass_redemption_id IS NOT NULL AND id IN (SELECT value FROM json_each(?))', JSON.stringify(moved.map(m => m.lineId)))).map(r => [r.id, r.pass_redemption_id]))
  for (const m of moved) {
    const redemptionId = entries.get(m.lineId)
    if (!redemptionId) continue
    const id = carryPassEntry(unit, { redemptionId }, { orderId, claimId: m.claimId })
    unit.add(sql`UPDATE box_office_order_lines SET pass_redemption_id = ${id} WHERE claim_id = ${m.claimId}`).expect(1, TAKEN)
  }
}

export interface OfferedPass { code: string, name: string, priceName: string, owedMinor: number, left: number | null, /** Why it cannot be used here, in the refusal's words, or null. */ unusable: string | null }

/**
 * What the Choose tickets page says about passes for a performance: whether any pass on offer or
 * held covers it, so the box is shown at all, and the signed-in visitor's own passes that do, each
 * usable or saying why not, so nothing has to be typed.
 */
export async function passesFor(performanceId: string, account: string | null, at = nowMs()): Promise<{ accepted: boolean, mine: OfferedPass[] }> {
  const performance = await getPerformance(performanceId)
  const production = await getProduction(performance.productionId)
  const types = await all<{ id: string }>(
    `SELECT t.id FROM box_office_pass_types t WHERE (t.covers_from IS NULL OR t.covers_from <= ?1) AND (t.covers_until IS NULL OR t.covers_until > ?1)
        AND (t.covers = 'dates' OR (t.covers = 'season' AND t.season_id = ?2) OR (t.covers = 'productions' AND EXISTS (SELECT 1 FROM box_office_pass_shows s WHERE s.pass_type_id = t.id AND s.production_id = ?3))) -- not-policy: the third bound value
        AND (t.active = 1 OR EXISTS (SELECT 1 FROM box_office_passes p WHERE p.pass_type_id = t.id AND p.state = 'active'))`, // not-policy: SQL parameter numbers
    performance.startsAt, production.seasonId, production.id)
  if (!types.length || !account) return { accepted: types.length > 0, mine: [] }
  const held = await all<{ code: string | null }>(
    `SELECT p.code FROM box_office_passes p WHERE p.state = 'active' AND p.issued_at IS NOT NULL AND p.pass_type_id IN (SELECT value FROM json_each(?1)) AND p.account_id IN (${accountScopeSql('?2')}) ORDER BY p.created_at, p.id`, // not-policy: a SQL parameter number
    JSON.stringify(types.map(t => t.id)), account)
  const mine: OfferedPass[] = []
  for (const row of held) {
    if (!row.code) continue
    const code = await openColumn(row.code) as string
    try {
      const judged = await judgePass(code, performanceId, { channel: 'online', account }, at)
      mine.push({ code: shownPassCode(code), name: judged.name, priceName: judged.priceName, owedMinor: judged.owedMinor, left: judged.left, unusable: null })
    }
    catch (error) {
      const refusal = error as { name?: string, reason?: string, remedy?: string }
      if (refusal?.name !== 'Refusal') throw error
      const type = await first<{ name: string, price_name: string }>(
        'SELECT t.name, r.name AS price_name FROM box_office_passes p JOIN box_office_pass_types t ON t.id = p.pass_type_id JOIN box_office_pass_prices r ON r.id = p.pass_price_id WHERE p.code_hash = ?', await hashOf(code))
      mine.push({ code: shownPassCode(code), name: type?.name ?? '', priceName: type?.price_name ?? '', owedMinor: 0, left: null, unusable: [refusal.reason, refusal.remedy].filter(Boolean).join(' ') })
    }
  }
  return { accepted: true, mine }
}

/** A pass as the till sees it once found (BO-64). `unusable` says why it gives no entry tonight; what it owes can still be paid. */
export interface DeskPass {
  code: string
  name: string
  priceName: string
  holder: string | null
  owedMinor: number
  left: number | null
  unusable: { code: string, reason: string, remedy: string | null } | null
}

/**
 * A pass scanned or typed at the till, judged for the performance being sold. One that is unknown or
 * cancelled is refused; one that cannot give an entry tonight is still shown, saying why, so what it
 * owes can be paid. Reads only.
 */
export async function deskPass(typed: string, performanceId: string, at = nowMs()): Promise<DeskPass> {
  const row = await first<{ id: string, code: string | null, name: string, price_name: string, account_id: string | null, amount_minor: number, paid_at: number | null, uses_total: number | null, uses_taken: number, state: string, issued_at: number | null }>(
    `SELECT p.id, p.code, t.name, r.name AS price_name, p.account_id, p.amount_minor, p.paid_at, p.uses_total, p.uses_taken, p.state, p.issued_at
      FROM box_office_passes p JOIN box_office_pass_types t ON t.id = p.pass_type_id JOIN box_office_pass_prices r ON r.id = p.pass_price_id WHERE p.code_hash = ? OR p.alias_hash = ?`, ...await passCodeHashes(typed))
  if (!row || !row.issued_at) refuse('box-office.pass.unknown', 'We do not recognise that pass code.', { status: 422, remedy: 'Check how it is spelt. It is on the pass and in its email.', fields: field('unknown') })
  if (row.state !== 'active') refuse('box-office.pass.void', 'That pass has been cancelled.', { status: 422, remedy: 'Open it from Passes to see who cancelled it.', fields: field('void') })
  const code = row.code ? shownPassCode(await openColumn(row.code) as string) : typed.trim()
  const base = { code, name: row.name, priceName: row.price_name, holder: row.account_id ? await accountLabel(row.account_id) : null, owedMinor: row.paid_at ? 0 : row.amount_minor }
  try {
    const judged = await judgePass(code, performanceId, { channel: 'desk', account: null }, at)
    return { ...base, left: judged.left, unusable: null }
  }
  catch (error) {
    if (!isRefusal(error)) throw error
    return { ...base, left: row.uses_total === null ? null : row.uses_total - row.uses_taken, unusable: { code: error.code, reason: error.reason, remedy: error.remedy ?? null } }
  }
}
