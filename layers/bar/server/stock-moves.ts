// Moving stock by hand (Bar specification, tab 3, "Stock movements" and "A delivery"): deliveries,
// wastage and moving stock between locations. A delivery is built up as a draft and received in one
// batch; received is final. Wastage and a move are written at once. Each writes its movements in one
// statement, so a long delivery is one batch whatever its length.
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { accountLabel } from '#modules/core'
import { writeMovements, type Movement } from './stock'

export const WASTAGE_REASONS = 'bar.wastage-reason'
export const SUPPLIERS = 'bar.supplier'

const id = z.string().min(1).max(64) // not-policy: an id's length
const quantity = z.number().int().min(1).max(10_000_000) // not-policy: a bound on a typed quantity (10 kl, 10 t)
// A long delivery note; a set is also capped by core.units.set-rows-limit, checked below.
const MAX_LINES = 500 // not-policy: matches core.units.set-rows-limit's default

const deliveryLine = z.object({
  stockItemId: id,
  packs: z.number().int().min(0).max(100_000), // not-policy: a bound on a typed count
  looseUnits: z.number().int().min(0).max(10_000_000), // not-policy: a bound on a typed quantity
  packCostMinor: z.number().int().min(0).max(10_000_000).nullable().optional(), // not-policy: a bound on a typed cost
}).strict().refine(l => l.packs + l.looseUnits > 0, { message: 'Give a number of packs or loose units.', path: ['packs'] })
const lines = <T extends z.ZodTypeAny>(line: T) => z.array(line).max(MAX_LINES)

export const deliveryInput = z.object({
  locationId: id,
  supplierTermId: id.nullable().optional(),
  supplierRef: z.string().trim().min(1).max(40).nullable().optional(), // not-policy: a delivery note number's bound
  lines: lines(deliveryLine),
}).strict().refine(v => new Set(v.lines.map(l => l.stockItemId)).size === v.lines.length, { message: 'Each item once.', path: ['lines'] })
export type DeliveryInput = z.infer<typeof deliveryInput>

export const deliveryPatch = z.object({
  locationId: id,
  supplierTermId: id.nullable(),
  supplierRef: z.string().trim().min(1).max(40).nullable(), // not-policy: a delivery note number's bound
  lines: lines(deliveryLine),
}).partial().strict().refine(v => !v.lines || new Set(v.lines.map(l => l.stockItemId)).size === v.lines.length, { message: 'Each item once.', path: ['lines'] })
export type DeliveryPatch = z.infer<typeof deliveryPatch>

const itemQuantity = z.object({ stockItemId: id, quantity }).strict()
export const wastageInput = z.object({
  locationId: id,
  reasonTermId: id,
  lines: lines(itemQuantity).min(1),
}).strict().refine(v => new Set(v.lines.map(l => l.stockItemId)).size === v.lines.length, { message: 'Each item once.', path: ['lines'] })
export type WastageInput = z.infer<typeof wastageInput>

export const transferInput = z.object({
  fromLocationId: id,
  toLocationId: id,
  lines: lines(itemQuantity).min(1),
}).strict()
  .refine(v => v.fromLocationId !== v.toLocationId, { message: 'Pick two different locations.', path: ['toLocationId'] })
  .refine(v => new Set(v.lines.map(l => l.stockItemId)).size === v.lines.length, { message: 'Each item once.', path: ['lines'] })
export type TransferInput = z.infer<typeof transferInput>

export interface DeliveryLine { id: string, stockItemId: string, packs: number, looseUnits: number, packCostMinor: number | null, quantity: number }
export interface Delivery {
  id: string
  locationId: string
  supplierTermId: string | null
  supplier: string | null
  supplierRef: string | null
  state: 'draft' | 'received'
  createdBy: string
  receivedBy: string | null
  receivedAt: number | null
  createdAt: number
  lines: DeliveryLine[]
}

async function assertSetSize(count: number): Promise<void> {
  const limit = await useSetting('core.units.set-rows-limit') as number
  if (count > limit) refuse('bar.stock.too-many-lines', `At most ${limit} lines go in one go.`, { status: 422, remedy: 'Split it in two.' })
}

async function assertLocation(locationId: string): Promise<void> {
  if (!await first('SELECT 1 FROM bar_stock_locations WHERE id = ? AND active = 1', locationId))
    refuse('bar.stock-location.unknown', 'There is no such location in use.', { status: 422, remedy: 'Pick a location that is in use.' })
}

/** The items named, in use, with their pack sizes; refuses if any is unknown or retired. */
async function itemsInUse(ids: string[]): Promise<Map<string, { packSize: number }>> {
  const found = await all<{ id: string, pack_size: number }>('SELECT id, pack_size FROM bar_stock_items WHERE active = 1 AND id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))
  if (found.length !== new Set(ids).size) refuse('bar.stock-item.unknown', 'One of those stock items is not in use.', { status: 422, remedy: 'Pick items that are in use.' })
  return new Map(found.map(r => [r.id, { packSize: r.pack_size }]))
}

const DELIVERY_GONE = { code: 'bar.delivery.unknown', reason: 'There is no such delivery.' }
const NOT_DRAFT = { code: 'bar.delivery.received', reason: 'This delivery has been received, so it cannot change.', remedy: 'Record another delivery, or wastage, to put it right.' }

export async function deliveries(options: { limit?: number } = {}): Promise<Delivery[]> {
  const rows = await all<{ id: string, location_id: string, supplier_term: string | null, supplier: string | null, supplier_ref: string | null, state: 'draft' | 'received', created_by: string, received_by: string | null, received_at: number | null, created_at: number }>(
    `SELECT d.id, d.location_id, d.supplier_term, t.label AS supplier, d.supplier_ref, d.state, d.created_by, d.received_by, d.received_at, d.created_at
       FROM bar_deliveries d LEFT JOIN core_terms t ON t.id = d.supplier_term
      ORDER BY d.state = 'draft' DESC, coalesce(d.received_at, d.created_at) DESC, d.id DESC LIMIT ?`,
    options.limit ?? 50, // not-policy: a page of recent deliveries
  )
  const lineRows = await all<{ id: string, delivery_id: string, stock_item_id: string, packs: number, loose_units: number, pack_cost_minor: number | null, pack_size: number }>(
    `SELECT l.id, l.delivery_id, l.stock_item_id, l.packs, l.loose_units, l.pack_cost_minor, i.pack_size FROM bar_delivery_lines l JOIN bar_stock_items i ON i.id = l.stock_item_id
      WHERE l.delivery_id IN (SELECT value FROM json_each(?)) ORDER BY l.rowid`,
    JSON.stringify(rows.map(r => r.id)),
  )
  const byDelivery = new Map<string, DeliveryLine[]>()
  for (const l of lineRows) {
    byDelivery.set(l.delivery_id, [...byDelivery.get(l.delivery_id) ?? [], { id: l.id, stockItemId: l.stock_item_id, packs: l.packs, looseUnits: l.loose_units, packCostMinor: l.pack_cost_minor, quantity: l.packs * l.pack_size + l.loose_units }])
  }
  const names = new Map<string, string>()
  for (const who of new Set(rows.flatMap(r => [r.created_by, r.received_by].filter((x): x is string => !!x)))) names.set(who, await accountLabel(who))
  return rows.map(r => ({
    id: r.id, locationId: r.location_id, supplierTermId: r.supplier_term, supplier: r.supplier, supplierRef: r.supplier_ref, state: r.state,
    createdBy: names.get(r.created_by) ?? '', receivedBy: r.received_by ? names.get(r.received_by) ?? '' : null, receivedAt: r.received_at, createdAt: r.created_at,
    lines: byDelivery.get(r.id) ?? [],
  }))
}

function addLines(unit: UnitView, deliveryId: string, input: DeliveryInput['lines'], at: number): void {
  if (!input.length) return
  unit.add({
    sql: `INSERT INTO bar_delivery_lines (id, delivery_id, stock_item_id, packs, loose_units, pack_cost_minor, created_at)
          SELECT json_extract(j.value, '$.id'), ?, i.id, json_extract(j.value, '$.p'), json_extract(j.value, '$.u'), json_extract(j.value, '$.c'), ?
            FROM json_each(?) j JOIN bar_stock_items i ON i.id = json_extract(j.value, '$.i') AND i.active = 1`,
    params: [deliveryId, at, JSON.stringify(input.map(l => ({ id: newId('bdll'), i: l.stockItemId, p: l.packs, u: l.looseUnits, c: l.packCostMinor ?? null })))],
  }).expect(input.length, { code: 'bar.stock-item.unknown', reason: 'One of those stock items is not in use.', remedy: 'Pick items that are in use.' })
}

/** Starts a delivery as a draft, with what is known of it so far. */
export async function addDelivery(unit: UnitView, input: DeliveryInput, by: string): Promise<string> {
  await assertSetSize(input.lines.length)
  await assertLocation(input.locationId)
  const deliveryId = newId('bdlv')
  const at = nowMs()
  const supplier = input.supplierTermId ?? null
  unit.add({
    sql: `INSERT INTO bar_deliveries (id, location_id, supplier_term, supplier_ref, state, created_by, received_by, received_at, created_at, updated_at)
          SELECT ?, ?, ?, ?, 'draft', ?, NULL, NULL, ?, ? WHERE (? IS NULL OR EXISTS (SELECT 1 FROM core_terms WHERE id = ? AND vocabulary_key = ? AND retired_at IS NULL))`,
    params: [deliveryId, input.locationId, supplier, input.supplierRef ?? null, by, at, at, supplier, supplier, SUPPLIERS],
  }).expect(1, { code: 'bar.delivery.supplier', reason: 'That supplier is not on the list.', remedy: 'Pick a supplier from the list, or add one.' })
  addLines(unit, deliveryId, input.lines, at)
  unit.audit({ action: 'create', record: ['bar.delivery', deliveryId] })
  return deliveryId
}

/** Changes a draft: where it goes, the supplier, the note number, or its lines (all replaced). */
export async function updateDelivery(unit: UnitView, deliveryId: string, input: DeliveryPatch): Promise<void> {
  const row = await first<{ location_id: string, supplier_term: string | null, supplier_ref: string | null, state: string }>('SELECT location_id, supplier_term, supplier_ref, state FROM bar_deliveries WHERE id = ?', deliveryId)
  if (!row) refuse(DELIVERY_GONE.code, DELIVERY_GONE.reason, { status: 404 })
  if (row!.state !== 'draft') refuse(NOT_DRAFT.code, NOT_DRAFT.reason, { status: 409, remedy: NOT_DRAFT.remedy })
  if (input.lines) await assertSetSize(input.lines.length)
  const locationId = input.locationId ?? row!.location_id
  if (locationId !== row!.location_id) await assertLocation(locationId)
  const supplier = input.supplierTermId === undefined ? row!.supplier_term : input.supplierTermId
  const ref = input.supplierRef === undefined ? row!.supplier_ref : input.supplierRef
  const at = nowMs()
  unit.add({
    sql: `UPDATE bar_deliveries SET location_id = ?, supplier_term = ?, supplier_ref = ?, updated_at = ?
          WHERE id = ? AND state = 'draft' AND (? IS NULL OR ? IS ? OR EXISTS (SELECT 1 FROM core_terms WHERE id = ? AND vocabulary_key = ? AND retired_at IS NULL))`,
    params: [locationId, supplier, ref, at, deliveryId, supplier, supplier, row!.supplier_term, supplier, SUPPLIERS],
  }).expect(1, { code: 'bar.delivery.refused', reason: 'This delivery has been received, or that supplier is not on the list.', remedy: 'Reload it and check the supplier.' })
  if (input.lines) {
    unit.add({ sql: 'DELETE FROM bar_delivery_lines WHERE delivery_id = ?', params: [deliveryId] })
    addLines(unit, deliveryId, input.lines, at)
  }
  unit.audit({ action: 'update', record: ['bar.delivery', deliveryId] })
}

/** Throws a draft away. A received delivery stays. */
export async function discardDelivery(unit: UnitView, deliveryId: string): Promise<void> {
  const row = await first<{ state: string }>('SELECT state FROM bar_deliveries WHERE id = ?', deliveryId)
  if (!row) refuse(DELIVERY_GONE.code, DELIVERY_GONE.reason, { status: 404 })
  if (row!.state !== 'draft') refuse(NOT_DRAFT.code, NOT_DRAFT.reason, { status: 409, remedy: NOT_DRAFT.remedy })
  unit.add({ sql: 'DELETE FROM bar_delivery_lines WHERE delivery_id = ? AND EXISTS (SELECT 1 FROM bar_deliveries WHERE id = ? AND state = \'draft\')', params: [deliveryId, deliveryId] })
  unit.add({ sql: 'DELETE FROM bar_deliveries WHERE id = ? AND state = \'draft\'', params: [deliveryId] }).expect(1, NOT_DRAFT)
  unit.audit({ action: 'delete', record: ['bar.delivery', deliveryId] })
}

/**
 * Receives a draft: a delivery movement per line (packs times pack size, plus loose units) into its
 * location, and each item's pack cost where one was given, in one batch. The delivery must not have
 * changed since it was read, so what is moved is what was shown.
 */
export async function receiveDelivery(unit: UnitView, deliveryId: string, by: string): Promise<void> {
  const row = await first<{ location_id: string, state: string, updated_at: number }>('SELECT location_id, state, updated_at FROM bar_deliveries WHERE id = ?', deliveryId)
  if (!row) refuse(DELIVERY_GONE.code, DELIVERY_GONE.reason, { status: 404 })
  if (row!.state !== 'draft') refuse(NOT_DRAFT.code, NOT_DRAFT.reason, { status: 409, remedy: NOT_DRAFT.remedy })
  await assertLocation(row!.location_id)
  const items = await all<{ id: string, stock_item_id: string, packs: number, loose_units: number, pack_cost_minor: number | null, pack_size: number, active: number }>(
    'SELECT l.id, l.stock_item_id, l.packs, l.loose_units, l.pack_cost_minor, i.pack_size, i.active FROM bar_delivery_lines l JOIN bar_stock_items i ON i.id = l.stock_item_id WHERE l.delivery_id = ? ORDER BY l.id', deliveryId,
  )
  if (!items.length) refuse('bar.delivery.empty', 'This delivery has nothing on it.', { status: 422, remedy: 'Add what arrived first.' })
  if (items.some(i => !i.active)) refuse('bar.stock-item.unknown', 'One of those stock items is no longer in use.', { status: 422, remedy: 'Take it off the delivery.' })
  const at = nowMs()
  unit.add({
    sql: 'UPDATE bar_deliveries SET state = \'received\', received_by = ?, received_at = ?, updated_at = ? WHERE id = ? AND state = \'draft\' AND updated_at = ?',
    params: [by, at, at, deliveryId, row!.updated_at],
  }).expect(1, { code: 'bar.delivery.changed', reason: 'This delivery was changed or received while you had it open.', remedy: 'Reload it and check it again.' })
  writeMovements(unit, items.map(l => ({
    itemId: l.stock_item_id, locationId: row!.location_id, kind: 'delivery' as const, quantity: l.packs * l.pack_size + l.loose_units,
    sourceType: 'bar.delivery-line', sourceId: l.id, key: `bar:delivery-line:${l.id}`, by,
  })), at)
  if (items.some(l => l.pack_cost_minor !== null)) {
    unit.add({
      sql: `UPDATE bar_stock_items SET cost_minor = (SELECT l.pack_cost_minor FROM bar_delivery_lines l WHERE l.delivery_id = ?1 AND l.stock_item_id = bar_stock_items.id), updated_at = ?2
            WHERE id IN (SELECT stock_item_id FROM bar_delivery_lines WHERE delivery_id = ?1 AND pack_cost_minor IS NOT NULL)`,
      params: [deliveryId, at],
    })
  }
  unit.audit({ action: 'update', record: ['bar.delivery', deliveryId], detail: { state: 'received' } })
  unit.announce('bar.delivery.received', { deliveryId, locationId: row!.location_id }, { record: ['bar.delivery', deliveryId] })
}

/** Writes stock off at a location, with one reason for the lot: a dropped bottle, a keg gone off. */
export async function wasteStock(unit: UnitView, input: WastageInput, by: string): Promise<string> {
  await assertSetSize(input.lines.length)
  await assertLocation(input.locationId)
  await itemsInUse(input.lines.map(l => l.stockItemId))
  if (!await first('SELECT 1 FROM core_terms WHERE id = ? AND vocabulary_key = ? AND retired_at IS NULL', input.reasonTermId, WASTAGE_REASONS))
    refuse('bar.wastage.reason', 'That reason is not on the list.', { status: 422, remedy: 'Pick a reason from the list.' })
  const wastageId = newId('bwst')
  writeMovements(unit, input.lines.map(l => ({
    itemId: l.stockItemId, locationId: input.locationId, kind: 'wastage' as const, quantity: -l.quantity, reasonTerm: input.reasonTermId,
    sourceType: 'bar.wastage', sourceId: wastageId, key: `bar:wastage:${wastageId}:${l.stockItemId}`, by,
  })), nowMs())
  unit.audit({ action: 'create', record: ['bar.stock-location', input.locationId], detail: { wastage: wastageId, items: input.lines.map(l => l.stockItemId) } })
  return wastageId
}

/** Moves stock from one location to another: equal and opposite movements, in one batch. */
export async function transferStock(unit: UnitView, input: TransferInput, by: string): Promise<string> {
  await assertSetSize(input.lines.length * 2)
  await assertLocation(input.fromLocationId)
  await assertLocation(input.toLocationId)
  await itemsInUse(input.lines.map(l => l.stockItemId))
  const transferId = newId('btrf')
  writeMovements(unit, input.lines.flatMap(l => [
    { itemId: l.stockItemId, locationId: input.fromLocationId, kind: 'transfer_out' as const, quantity: -l.quantity, sourceType: 'bar.transfer', sourceId: transferId, key: `bar:transfer:${transferId}:${l.stockItemId}:out`, by },
    { itemId: l.stockItemId, locationId: input.toLocationId, kind: 'transfer_in' as const, quantity: l.quantity, sourceType: 'bar.transfer', sourceId: transferId, key: `bar:transfer:${transferId}:${l.stockItemId}:in`, by },
  ] satisfies Movement[]), nowMs())
  unit.audit({ action: 'create', record: ['bar.stock-location', input.fromLocationId], detail: { transfer: transferId, to: input.toLocationId, items: input.lines.map(l => l.stockItemId) } })
  return transferId
}

export interface MovementRow { id: string, stockItemId: string, locationId: string, kind: string, quantity: number, reason: string | null, sourceType: string, sourceId: string, by: string | null, at: number }

/** The latest movements, newest first, of one item or at one location, or of everything. */
export async function movements(filter: { stockItemId?: string, locationId?: string, limit?: number }): Promise<MovementRow[]> {
  const rows = await all<{ id: string, stock_item_id: string, location_id: string, kind: string, quantity: number, reason: string | null, source_type: string, source_id: string, by: string | null, at: number }>(
    `SELECT m.id, m.stock_item_id, m.location_id, m.kind, m.quantity, t.label AS reason, m.source_type, m.source_id, m.by, m.at
       FROM bar_stock_movements m LEFT JOIN core_terms t ON t.id = m.reason_term
      WHERE (? IS NULL OR m.stock_item_id = ?) AND (? IS NULL OR m.location_id = ?)
      ORDER BY m.at DESC, m.id DESC LIMIT ?`,
    filter.stockItemId ?? null, filter.stockItemId ?? null, filter.locationId ?? null, filter.locationId ?? null, filter.limit ?? 100, // not-policy: a page of history
  )
  const names = new Map<string, string>()
  for (const who of new Set(rows.flatMap(r => r.by ? [r.by] : []))) names.set(who, await accountLabel(who))
  return rows.map(r => ({ id: r.id, stockItemId: r.stock_item_id, locationId: r.location_id, kind: r.kind, quantity: r.quantity, reason: r.reason, sourceType: r.source_type, sourceId: r.source_id, by: r.by ? names.get(r.by) ?? null : null, at: r.at }))
}
