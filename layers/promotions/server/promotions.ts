// Promotions: making, changing and retiring them, and pricing a sale with them (the unified
// promotions design). The pricing here is Payments' payments.pricing: a selling module hands its
// items to priceSale and writes the savings that come back on its own lines.
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, usePoint, type UnitView } from '#kit'
import type { PricedSale, PricedSaving, PricingInput } from '#modules/payments'
import type { TRIGGERS } from './db/schema'
import { codes as codesTable, redemptions as redemptionsTable, targets as targetsTable, CHANNELS, COUNT_BY, EFFECTS } from './db/schema'
import { priceItems, type EngineItem, type EngineRule } from './engine'
import type { PromotionTarget, Scope, TargetField } from './points/target'

export type Trigger = typeof TRIGGERS[number]
export type Effect = typeof EFFECTS[number]

export interface PromotionTargetRow { role: 'applies' | 'requires', kind: string, scope: Scope, quantity: number, words: string | null }
export interface PromotionCode { id: string, code: string, maxUses: number | null, used: number, active: boolean, note: string | null }
export interface Promotion {
  id: string
  name: string
  label: string
  trigger: Trigger
  effect: Effect
  value: number
  buyQuantity: number | null
  freeQuantity: number | null
  channel: typeof CHANNELS[number]
  validFrom: number | null
  validUntil: number | null
  minSpendMinor: number | null
  maxUses: number | null
  used: number
  countBy: typeof COUNT_BY[number]
  maxPerSale: number | null
  combines: boolean
  notWithRequirements: boolean
  active: boolean
  note: string | null
  codes: PromotionCode[]
  targets: PromotionTargetRow[]
}

interface Row {
  id: string
  name: string
  label: string
  trigger: Trigger
  effect: Effect
  value: number
  buy_quantity: number | null
  free_quantity: number | null
  channel: Promotion['channel']
  valid_from: number | null
  valid_until: number | null
  min_spend_minor: number | null
  max_uses: number | null
  used: number
  count_by: Promotion['countBy']
  max_per_sale: number | null
  combines: number
  not_with_requirements: number
  active: number
  note: string | null
}
interface TargetRow { promotion_id: string, role: 'applies' | 'requires', kind: string, scope: string | null, quantity: number }
interface CodeRow { id: string, promotion_id: string, code: string, max_uses: number | null, used: number, active: number, note: string | null }

const toPromotion = (r: Row, codes: CodeRow[], targets: PromotionTargetRow[]): Promotion => ({
  id: r.id, name: r.name, label: r.label, trigger: r.trigger, effect: r.effect, value: r.value, buyQuantity: r.buy_quantity, freeQuantity: r.free_quantity, channel: r.channel,
  validFrom: r.valid_from, validUntil: r.valid_until, minSpendMinor: r.min_spend_minor, maxUses: r.max_uses, used: r.used, countBy: r.count_by, maxPerSale: r.max_per_sale,
  combines: !!r.combines, notWithRequirements: !!r.not_with_requirements, active: !!r.active, note: r.note,
  codes: codes.map(c => ({ id: c.id, code: c.code, maxUses: c.max_uses, used: c.used, active: !!c.active, note: c.note })),
  targets,
})

/** A code as typed: spaces dropped and upper-case, so "spring 25" and "SPRING25" are the same code. */
export const normaliseCode = (typed: string) => typed.replace(/\s+/g, '').toUpperCase()

/** The kinds of item the modules that are on sell, by kind. */
export async function targetKinds(): Promise<Map<string, PromotionTarget>> {
  return new Map((await usePoint<PromotionTarget>('promotions.target')).map(c => [c.id, c.value]))
}

const scope = z.record(z.string().min(1).max(40), z.string().min(1).max(64)) // not-policy: a field's id; an id
export const promotionInput = z.object({
  name: z.string().trim().min(1).max(80), // not-policy: as long as a name a person may type
  label: z.string().trim().min(1).max(60), // not-policy: fits beside a price
  trigger: z.enum(['automatic', 'code']),
  effect: z.enum(EFFECTS),
  value: z.number().int().min(0).max(10_000_000), // not-policy: a sanity bound; percent_off is held to 10000 basis points
  buyQuantity: z.number().int().min(2).max(50).nullable().optional(), // not-policy: a group no till rings up
  freeQuantity: z.number().int().min(1).max(49).nullable().optional(), // not-policy: fewer than the group
  channel: z.enum(CHANNELS).optional(),
  validFrom: z.number().int().positive().nullable().optional(),
  validUntil: z.number().int().positive().nullable().optional(),
  minSpendMinor: z.number().int().min(1).max(10_000_000).nullable().optional(), // not-policy: a sanity bound
  maxUses: z.number().int().min(1).max(1_000_000).nullable().optional(), // not-policy: a sanity bound
  countBy: z.enum(COUNT_BY).optional(),
  maxPerSale: z.number().int().min(1).max(500).nullable().optional(), // not-policy: the desk cap's own ceiling
  combines: z.boolean().optional(),
  notWithRequirements: z.boolean().optional(),
  note: z.string().trim().max(200).nullable().optional(), // not-policy: one line about who it is for
  codes: z.array(z.object({
    id: z.string().max(40).optional(), // not-policy: an id
    code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9 _-]+$/, 'Letters, numbers, hyphens and underscores only.'), // not-policy: a code someone can type
    maxUses: z.number().int().min(1).max(1_000_000).nullable().optional(), // not-policy: a sanity bound
    note: z.string().trim().max(200).nullable().optional(), // not-policy: one line
  }).strict()).max(50).optional(), // not-policy: more codes than a form shows
  targets: z.array(z.object({
    role: z.enum(['applies', 'requires']),
    kind: z.string().min(3).max(60), // not-policy: a kind's id
    scope: scope.optional(),
    quantity: z.number().int().min(1).max(50).optional(), // not-policy: more than any sale holds of one thing
  }).strict()).min(1).max(20), // not-policy: more than a form shows
}).strict()
export type PromotionInput = z.infer<typeof promotionInput>

export async function listPromotions(): Promise<Promotion[]> {
  const [rows, codes, targets, kinds] = await Promise.all([
    all<Row>('SELECT * FROM promotions_promotions ORDER BY active DESC, name'),
    all<CodeRow>('SELECT * FROM promotions_codes ORDER BY code'),
    all<TargetRow>('SELECT promotion_id, role, kind, scope, quantity FROM promotions_targets ORDER BY sort, id'),
    targetKinds(),
  ])
  const words = await Promise.all(targets.map(async (t) => {
    const s = t.scope ? JSON.parse(t.scope) as Scope : {}
    return { promotionId: t.promotion_id, row: { role: t.role, kind: t.kind, scope: s, quantity: t.quantity, words: await kinds.get(t.kind)?.describe(s).catch(() => null) ?? null } }
  }))
  return rows.map(r => toPromotion(r, codes.filter(c => c.promotion_id === r.id), words.filter(w => w.promotionId === r.id).map(w => w.row)))
}

/** The kinds of item a promotion can be for, with each one's pickers, for the form. */
export async function formKinds(): Promise<{ kind: string, label: string, fields: TargetField[] }[]> {
  const kinds = [...await targetKinds()].sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
  return Promise.all(kinds.map(async ([kind, t]) => ({ kind, label: t.label, fields: await t.fields() })))
}

const TAKEN = { code: 'promotions.code.taken', reason: 'Another promotion already has that code.', fields: { codes: 'Choose another code.' } }

async function checked(input: PromotionInput): Promise<PromotionInput> {
  const fail = (code: string, reason: string, field: string, words: string): never => refuse(`promotions.promotion.${code}`, reason, { status: 422, fields: { [field]: words } })
  if (input.effect === 'percent_off' && (input.value < 1 || input.value > 10000)) // not-policy: basis points, 1 to 100 per cent
    fail('percent', 'A percentage off is between 1 and 100.', 'value', 'Between 1 and 100.')
  if ((input.effect === 'amount_off' || input.effect === 'basket_amount_off') && input.value < 1) fail('amount', 'An amount off is more than nothing.', 'value', 'More than nothing.')
  if (input.effect === 'multi_buy') {
    if (!input.buyQuantity) fail('multi-buy', 'Say how many make a group.', 'buyQuantity', 'How many make a group.')
    if (input.freeQuantity && input.freeQuantity >= input.buyQuantity!) fail('multi-buy', 'Fewer must be free than make a group.', 'freeQuantity', 'Fewer than the group.')
    if (!input.freeQuantity && input.value < 1) fail('multi-buy', 'Give the group a price, or make some of it free.', 'value', 'More than nothing.')
  }
  if (input.validFrom && input.validUntil && input.validUntil <= input.validFrom) fail('window', 'The promotion ends before it starts.', 'validUntil', 'After the start.')
  if (input.trigger === 'code' && !input.codes?.length) fail('no-code', 'A promotion started by a code needs a code.', 'codes', 'Add a code.')
  if (!input.targets.some(t => t.role === 'applies')) fail('no-target', 'Say what the promotion applies to.', 'targets', 'Add what it applies to.')
  const kinds = await targetKinds()
  const targets = await Promise.all(input.targets.map(async (t) => {
    const kind = kinds.get(t.kind)
    if (!kind) fail('kind', 'That kind of item is not sold here.', 'targets', 'Choose another.')
    return { ...t, scope: await kind!.check(t.scope ?? {}) }
  }))
  const codes = (input.trigger === 'code' ? input.codes ?? [] : []).map(c => ({ ...c, code: normaliseCode(c.code) }))
  if (new Set(codes.map(c => c.code)).size !== codes.length) fail('code-twice', 'The same code is given twice.', 'codes', 'Each code once.')
  return { ...input, codes, targets }
}

function writeChildren(unit: UnitView, promotionId: string, input: PromotionInput, at: number): void {
  unit.add(sql`DELETE FROM promotions_targets WHERE promotion_id = ${promotionId}`)
  unit.insertSet(targetsTable, input.targets.map((t, i) => ({ promotionId, role: t.role, kind: t.kind, scope: JSON.stringify(t.scope ?? {}), quantity: t.quantity ?? 1, sort: i, createdAt: at, updatedAt: at })))
  for (const c of input.codes ?? []) {
    if (c.id) {
      unit.add(sql`UPDATE promotions_codes SET code = ${c.code}, max_uses = ${c.maxUses ?? null}, note = ${c.note ?? null}, active = 1, updated_at = ${at}
        WHERE id = ${c.id} AND promotion_id = ${promotionId} AND NOT EXISTS (SELECT 1 FROM promotions_codes WHERE code = ${c.code} AND id <> ${c.id})
          AND (${c.maxUses ?? null} IS NULL OR used <= ${c.maxUses ?? null})`).expect(1, TAKEN)
    }
    else {
      // The unique index is the backstop; the caller has already said when a code is taken.
      unit.insertSet(codesTable, [{ promotionId, code: c.code, maxUses: c.maxUses ?? null, note: c.note ?? null, createdAt: at, updatedAt: at }])
    }
  }
  // A code left out is retired, not removed: sales it was used on still name it.
  const kept = (input.codes ?? []).filter(c => c.id).map(c => c.id!)
  unit.add(sql`UPDATE promotions_codes SET active = 0, updated_at = ${at} WHERE promotion_id = ${promotionId} AND active = 1 AND id NOT IN (SELECT value FROM json_each(${JSON.stringify(kept)}))
    AND code NOT IN (SELECT value FROM json_each(${JSON.stringify((input.codes ?? []).map(c => c.code))}))`)
}

const columns = (c: PromotionInput) => ({
  name: c.name, label: c.label, trigger: c.trigger, effect: c.effect, value: c.value, buyQuantity: c.effect === 'multi_buy' ? c.buyQuantity ?? null : null, freeQuantity: c.effect === 'multi_buy' ? c.freeQuantity ?? null : null,
  channel: c.channel ?? 'all', validFrom: c.validFrom ?? null, validUntil: c.validUntil ?? null, minSpendMinor: c.minSpendMinor ?? null, maxUses: c.maxUses ?? null, countBy: c.countBy ?? 'item',
  maxPerSale: c.maxPerSale ?? null, combines: c.combines ? 1 : 0, notWithRequirements: c.notWithRequirements ? 1 : 0, note: c.note ?? null,
})

export async function createPromotion(unit: UnitView, input: PromotionInput, actorId: string | null): Promise<string> {
  const c = await checked(input)
  for (const code of c.codes ?? []) if (await first('SELECT 1 FROM promotions_codes WHERE code = ?', code.code)) refuse(TAKEN.code, TAKEN.reason, { status: 409, fields: TAKEN.fields })
  const at = nowMs()
  const v = columns(c)
  const id = newId('prom')
  unit.add(sql`INSERT INTO promotions_promotions (id, name, label, trigger, effect, value, buy_quantity, free_quantity, channel, valid_from, valid_until, min_spend_minor, max_uses, count_by, max_per_sale, combines, not_with_requirements, note, active, created_by, created_at, updated_at)
    VALUES (${id}, ${v.name}, ${v.label}, ${v.trigger}, ${v.effect}, ${v.value}, ${v.buyQuantity}, ${v.freeQuantity}, ${v.channel}, ${v.validFrom}, ${v.validUntil}, ${v.minSpendMinor}, ${v.maxUses}, ${v.countBy}, ${v.maxPerSale}, ${v.combines}, ${v.notWithRequirements}, ${v.note}, 1, ${actorId}, ${at}, ${at})`)
  writeChildren(unit, id, c, at)
  unit.audit({ action: 'create', record: ['promotions.promotion', id] })
  return id
}

/** Changes a promotion. Sales already made keep their prices; its uses so far stay, and a limit below them is refused. */
export async function updatePromotion(unit: UnitView, id: string, input: PromotionInput): Promise<void> {
  const c = await checked(input)
  const now = await first<{ used: number }>('SELECT used FROM promotions_promotions WHERE id = ?', id)
  if (!now) refuse('promotions.promotion.not-found', 'There is no such promotion.', { status: 404 })
  if (c.maxUses !== null && c.maxUses !== undefined && c.maxUses < now.used)
    refuse('promotions.promotion.below-used', `This promotion has been used ${now.used} times, so its limit cannot go below that.`, { status: 422, fields: { maxUses: `At least ${now.used}.` } })
  const mine = new Set((await all<{ id: string }>('SELECT id FROM promotions_codes WHERE promotion_id = ?', id)).map(r => r.id))
  for (const code of c.codes ?? []) {
    if (code.id && !mine.has(code.id)) refuse('promotions.code.not-found', 'That code is not this promotion\'s.', { status: 422, fields: { codes: 'Remove it and add it again.' } })
    if (!code.id && await first('SELECT 1 FROM promotions_codes WHERE code = ?', code.code)) refuse(TAKEN.code, TAKEN.reason, { status: 409, fields: TAKEN.fields })
  }
  const at = nowMs()
  const v = columns(c)
  unit.add(sql`UPDATE promotions_promotions SET name = ${v.name}, label = ${v.label}, trigger = ${v.trigger}, effect = ${v.effect}, value = ${v.value}, buy_quantity = ${v.buyQuantity}, free_quantity = ${v.freeQuantity},
    channel = ${v.channel}, valid_from = ${v.validFrom}, valid_until = ${v.validUntil}, min_spend_minor = ${v.minSpendMinor}, max_uses = ${v.maxUses}, count_by = ${v.countBy}, max_per_sale = ${v.maxPerSale},
    combines = ${v.combines}, not_with_requirements = ${v.notWithRequirements}, note = ${v.note}, updated_at = ${at}
    WHERE id = ${id} AND (${v.maxUses} IS NULL OR used <= ${v.maxUses})`).expect(1, { code: 'promotions.promotion.below-used', reason: 'This promotion has just been used more often than that limit.' })
  writeChildren(unit, id, c, at)
  unit.audit({ action: 'update', record: ['promotions.promotion', id] })
}

/** Retires a promotion, or brings it back. Sales already made with it keep their prices. */
export function setPromotionActive(unit: UnitView, id: string, active: boolean): void {
  unit.add(sql`UPDATE promotions_promotions SET active = ${active ? 1 : 0}, updated_at = ${nowMs()} WHERE id = ${id}`)
    .expect(1, { code: 'promotions.promotion.not-found', reason: 'There is no such promotion.' })
  unit.audit({ action: 'state', record: ['promotions.promotion', id], detail: { active } })
}

// ---- Pricing (payments.pricing) ----

interface Candidate { row: Row, code: CodeRow | null }

const CODE_FIELDS = { promoCode: 'invalid' }

/** Whether any promotion applies on its own on this channel (payments.pricing's automatic). Reads only. */
export async function anyAutomatic(channel: PricingInput['channel']): Promise<boolean> {
  return !!await first("SELECT 1 FROM promotions_promotions WHERE active = 1 AND trigger = 'automatic' AND channel IN ('all', ?) LIMIT 1", channel)
}

/** The promotions in play: those that start on their own, and those of the codes typed, judged now. */
async function candidates(input: PricingInput, at: number): Promise<Candidate[]> {
  const channel = input.channel
  const auto = await all<Row>(`SELECT * FROM promotions_promotions WHERE active = 1 AND trigger = 'automatic' AND channel IN ('all', ?)
    AND (valid_from IS NULL OR valid_from <= ?) AND (valid_until IS NULL OR valid_until > ?)`, channel, at, at)
  const out: Candidate[] = auto.map(row => ({ row, code: null }))
  for (const typed of input.codes ?? []) {
    const code = normaliseCode(typed)
    if (!code) continue
    const found = await first<CodeRow>('SELECT * FROM promotions_codes WHERE code = ?', code)
    if (!found) refuse('promotions.code.unknown', 'We do not recognise that code.', { status: 422, remedy: 'Check how it is spelt.', fields: CODE_FIELDS })
    const row = (await first<Row>('SELECT * FROM promotions_promotions WHERE id = ?', found.promotion_id))!
    if (!found.active || !row.active || row.trigger !== 'code' || (row.valid_until !== null && at >= row.valid_until)) refuse('promotions.code.expired', 'That code has expired.', { status: 422, fields: CODE_FIELDS })
    if (row.valid_from !== null && at < row.valid_from) refuse('promotions.code.not-yet', 'That code cannot be used yet.', { status: 422, fields: CODE_FIELDS })
    if (row.channel !== 'all' && row.channel !== channel) refuse('promotions.code.not-here', channel === 'online' ? 'That code can only be used in person.' : 'That code can only be used online.', { status: 422, fields: CODE_FIELDS })
    if (!out.some(c => c.row.id === row.id)) out.push({ row, code: found })
  }
  return out
}

/** Live savings whose line has since been let go (a seat released), by promotion and code, so their uses are counted as given back. */
async function staleOf(promotionIds: string[]): Promise<{ ids: string[], byPromotion: Map<string, number>, byCode: Map<string, number> }> {
  const out = { ids: [] as string[], byPromotion: new Map<string, number>(), byCode: new Map<string, number>() }
  if (!promotionIds.length) return out
  const rows = await all<{ id: string, promotion_id: string, code_id: string | null, kind: string, ref: string, uses: number }>(
    `SELECT r.id, r.promotion_id, r.code_id, r.kind, r.ref, r.uses FROM promotions_redemptions r JOIN promotions_promotions p ON p.id = r.promotion_id
      LEFT JOIN promotions_codes c ON c.id = r.code_id
      WHERE r.state = 'live' AND r.uses > 0 AND (p.max_uses IS NOT NULL OR c.max_uses IS NOT NULL) AND r.promotion_id IN (SELECT value FROM json_each(?))`, JSON.stringify(promotionIds))
  if (!rows.length) return out
  const kinds = await targetKinds()
  for (const kind of new Set(rows.map(r => r.kind))) {
    const target = kinds.get(kind)
    if (!target) continue
    const mine = rows.filter(r => r.kind === kind)
    const live = await target.live([...new Set(mine.map(r => r.ref))])
    for (const r of mine.filter(r => !live.has(r.ref))) {
      out.ids.push(r.id)
      out.byPromotion.set(r.promotion_id, (out.byPromotion.get(r.promotion_id) ?? 0) + r.uses)
      if (r.code_id) out.byCode.set(r.code_id, (out.byCode.get(r.code_id) ?? 0) + r.uses)
    }
  }
  return out
}

const USED_UP = { code: 'promotions.code.used-up', reason: 'That code has been used up.', remedy: 'Book without it, or try another code.' }

/** Prices a sale with the promotions in play (payments.pricing's price). Reads only. */
export async function priceWithPromotions(input: PricingInput): Promise<PricedSale> {
  const at = nowMs()
  const none: PricedSale = { items: input.items.map(i => ({ key: i.key, discountMinor: 0 })), applied: [], savings: [], stale: [] }
  const found = await candidates(input, at)
  if (!found.length) return none
  const [targets, kinds, stale] = await Promise.all([
    all<TargetRow>('SELECT promotion_id, role, kind, scope, quantity FROM promotions_targets WHERE promotion_id IN (SELECT value FROM json_each(?)) ORDER BY sort, id', JSON.stringify(found.map(c => c.row.id))),
    targetKinds(),
    staleOf(found.map(c => c.row.id)),
  ])
  const keysFor = (t: TargetRow) => {
    const target = kinds.get(t.kind)
    const s = t.scope ? JSON.parse(t.scope) as Scope : {}
    return new Set(target ? input.items.filter(i => i.kind === t.kind && target.matches(s, i.facts)).map(i => i.key) : [])
  }
  const rules: EngineRule[] = []
  for (const { row, code } of found) {
    const mine = targets.filter(t => t.promotion_id === row.id)
    const applies = new Set(mine.filter(t => t.role === 'applies').flatMap(t => [...keysFor(t)]))
    const promotionLeft = row.max_uses === null ? null : row.max_uses - (row.used - (stale.byPromotion.get(row.id) ?? 0))
    const codeLeft = !code || code.max_uses === null ? null : code.max_uses - (code.used - (stale.byCode.get(code.id) ?? 0))
    const usesLeft = promotionLeft === null ? codeLeft : codeLeft === null ? promotionLeft : Math.min(promotionLeft, codeLeft)
    if (code && usesLeft !== null && usesLeft <= 0) refuse(USED_UP.code, USED_UP.reason, { status: 409, remedy: USED_UP.remedy, fields: CODE_FIELDS })
    rules.push({
      id: row.id, codeId: code?.id ?? null, effect: row.effect, value: row.value, buyQuantity: row.buy_quantity, freeQuantity: row.free_quantity, combines: !!row.combines,
      notWithRequirements: !!row.not_with_requirements, countBy: row.count_by, maxPerSale: input.preview ? null : row.max_per_sale, usesLeft, minSpendMinor: row.min_spend_minor, applies,
      requires: mine.filter(t => t.role === 'requires').map(t => ({ items: keysFor(t), quantity: t.quantity })),
    })
  }
  const items: EngineItem[] = input.items.map(i => ({ key: i.key, listMinor: i.listMinor, quantity: i.quantity, reduced: i.reduced }))
  // A preview prices each item as if it were alone, so every price the code gives shows.
  const priced = input.preview
    ? (() => {
        const each = items.map(item => priceItems([{ ...item, quantity: 1 }], rules))
        return { savings: each.flatMap(p => p.savings), byItem: new Map(each.flatMap(p => [...p.byItem])) }
      })()
    : priceItems(items, rules)
  const typed = found.filter(c => c.code)
  // A preview prices items one at a time, so an offer on the whole sale (a multi-buy, an amount off
  // the sale) shows no saving there; it is still named, so the buyer sees the code was taken.
  const wholeSale = (c: Candidate) => c.row.effect === 'multi_buy' || c.row.effect === 'basket_amount_off'
  for (const c of typed) {
    if (!priced.savings.some(s => s.ruleId === c.row.id) && !(input.preview && wholeSale(c)))
      refuse('promotions.code.no-items', 'That code does not apply to anything chosen.', { status: 422, remedy: 'Choose what it is for, or remove the code.', fields: CODE_FIELDS })
  }
  const byId = new Map(found.map(c => [c.row.id, c]))
  const savings: PricedSaving[] = priced.savings.map(s => ({ key: s.key, promotionId: s.ruleId, codeId: s.codeId, minor: s.minor, uses: s.uses }))
  const named = [...new Set([...savings.map(s => s.promotionId), ...(input.preview ? typed.map(c => c.row.id) : [])])]
  const applied = named.map((id) => {
    const c = byId.get(id)!
    return { promotionId: id, label: c.row.label, code: c.code?.code ?? null, savingMinor: savings.filter(s => s.promotionId === id).reduce((sum, s) => sum + s.minor, 0), effect: c.row.effect, value: c.row.value, maxPerSale: c.row.max_per_sale }
  })
  return { items: input.items.map(i => ({ key: i.key, discountMinor: priced.byItem.get(i.key) ?? 0 })), applied, savings, stale: stale.ids }
}

/** Writes a priced sale's savings (payments.pricing's redeem), the last use given once. */
export function redeemPromotions(unit: UnitView, priced: PricedSale, owner: { kind: string, saleRef: string, refs: Record<string, string> }): Record<string, string> {
  const at = nowMs()
  if (priced.stale.length)
    unit.add(sql`UPDATE promotions_redemptions SET state = 'released', updated_at = ${at} WHERE state = 'live' AND id IN (SELECT value FROM json_each(${JSON.stringify(priced.stale)}))`)
  const savings = priced.savings.filter(s => owner.refs[s.key] !== undefined)
  if (!savings.length) return {}
  const uses = (pick: (s: PricedSaving) => string | null) => {
    const out = new Map<string, number>()
    for (const s of savings) {
      const id = pick(s)
      if (id) out.set(id, (out.get(id) ?? 0) + s.uses)
    }
    return out
  }
  for (const [id, n] of uses(s => s.promotionId)) {
    unit.add(sql`UPDATE promotions_promotions SET updated_at = updated_at WHERE id = ${id} AND active = 1
      AND (valid_until IS NULL OR valid_until > ${at}) AND (max_uses IS NULL OR used + ${n} <= max_uses)`).expect(1, { ...USED_UP, reason: 'That promotion has just been used up.' })
  }
  for (const [id, n] of uses(s => s.codeId)) {
    unit.add(sql`UPDATE promotions_codes SET updated_at = updated_at WHERE id = ${id} AND active = 1 AND (max_uses IS NULL OR used + ${n} <= max_uses)`).expect(1, { ...USED_UP, reason: 'That code has just been used up.' })
  }
  const ids = unit.insertSet(redemptionsTable, savings.map(s => ({
    promotionId: s.promotionId, codeId: s.codeId, kind: owner.kind, saleRef: owner.saleRef, ref: owner.refs[s.key]!, uses: s.uses, discountMinor: s.minor, state: 'live', createdAt: at, updatedAt: at,
  })))
  const out: Record<string, string> = {}
  savings.forEach((s, i) => {
    if (!(s.key in out)) out[s.key] = ids[i]!
  })
  return out
}

/**
 * Moves savings to new references (payments.pricing's move): the seller let a seat go and took it
 * again, for a split booking. Each live redemption is released and written again on the new
 * reference, so the use is counted once throughout; one already given back is left as it is.
 */
export async function moveRedemptions(unit: UnitView, moves: { id: string, ref: string, saleRef: string }[]): Promise<Record<string, string>> {
  const live = new Set((await all<{ id: string }>("SELECT id FROM promotions_redemptions WHERE state = 'live' AND id IN (SELECT value FROM json_each(?))", JSON.stringify(moves.map(m => m.id)))).map(r => r.id))
  const going = moves.filter(m => live.has(m.id)).map(m => ({ ...m, to: newId('prdm') }))
  if (!going.length) return {}
  const at = nowMs()
  const MOVED = { code: 'promotions.redemption.moved', reason: 'These savings have just changed.' }
  unit.add(sql`UPDATE promotions_redemptions SET state = 'released', updated_at = ${at} WHERE state = 'live' AND id IN (SELECT json_extract(value, '$.id') FROM json_each(${JSON.stringify(going)}))`).expect(going.length, MOVED)
  unit.add(sql`INSERT INTO promotions_redemptions (id, promotion_id, code_id, kind, sale_ref, ref, uses, discount_minor, reason, applied_by, state, created_at, updated_at)
    SELECT json_extract(m.value, '$.to'), r.promotion_id, r.code_id, r.kind, json_extract(m.value, '$.saleRef'), json_extract(m.value, '$.ref'), r.uses, r.discount_minor, r.reason, r.applied_by, 'live', ${at}, ${at}
      FROM json_each(${JSON.stringify(going)}) m JOIN promotions_redemptions r ON r.id = json_extract(m.value, '$.id')`).expect(going.length, MOVED)
  return Object.fromEntries(going.map(m => [m.id, m.to]))
}

/** What kept references were (payments.pricing's describe). */
export async function describeRedemptions(ids: string[]): Promise<Map<string, { label: string, code: string | null }>> {
  const rows = await all<{ id: string, label: string, code: string | null }>(`SELECT r.id, p.label, c.code FROM promotions_redemptions r JOIN promotions_promotions p ON p.id = r.promotion_id
    LEFT JOIN promotions_codes c ON c.id = r.code_id WHERE r.id IN (SELECT value FROM json_each(?))`, JSON.stringify(ids))
  return new Map(rows.map(r => [r.id, { label: r.label, code: r.code }]))
}
