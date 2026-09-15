import { db, schema } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { createError } from 'h3'
import { newId } from '#server/utils/accounts'
import { postEntry, runLedgerBatch } from '#server/utils/ledger'
import { auditEntry } from '#shared/utils/audit'
import { saysMoney } from '#shared/utils/bar'
import { MAX_SETTLEMENT_CHARGES } from '#shared/utils/tab-settlement'
import type { MovementReason } from '#shared/utils/bar'
import type { ItemisedTab, TabCharge } from '#shared/utils/tab-settlement'
import type { LineKind } from '#shared/utils/ledger'
import type { BatchItem } from 'drizzle-orm/batch'
import type { SQL } from 'drizzle-orm'

// Settlement, itemisation and void of a tab charge (F-109). `ledger_entries` never accepts an
// UPDATE (0010): a charge is settled by being referenced, never by being rewritten.

interface ChargeRow {
  entryId: string
  happenedAt: number
  londonDay: string
  totalPence: number
  settledAt: number | null
  voided: number
}

// The settlement's own `happened_at`, not the charge's: a charge posted at 22:00 and settled at
// 23:30 was outstanding for ninety minutes, which the screen should be able to say (criterion 1).
const CHARGE_COLUMNS = sql`
  e.id AS entryId, e.happened_at AS happenedAt, e.london_day AS londonDay, e.total_pence AS totalPence,
  (SELECT s.happened_at FROM ledger_lines l JOIN ledger_entries s ON s.id = l.entry_id WHERE l.settles_entry_id = e.id) AS settledAt,
  EXISTS (SELECT 1 FROM ledger_entries v WHERE v.void_of_entry_id = e.id) AS voided
`

// Still owed: not a reversal, not a credit entry itself, not voided, not settled. Every balance
// shares it, so the account screen, the cap and the year-end list cannot drift apart (F-109).
export const OUTSTANDING_CHARGE = sql`
  e.reverses_entry_id IS NULL AND e.void_of_entry_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM ledger_entries v WHERE v.void_of_entry_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM ledger_lines l WHERE l.settles_entry_id = e.id)
`

// The cap as a condition on the charge's own insert, re-summing at the moment it is written: a
// read and a check cannot hold a cap two tills are charging against at once (F-108 criterion 3).
export function tabCapGuard(holderId: string, chargePence: number, capPence: number): SQL {
  return sql`
    (${chargePence} + (
      SELECT coalesce(sum(e.total_pence), 0) FROM ledger_entries e
      WHERE e.tab_debtor_id = ${holderId} AND ${OUTSTANDING_CHARGE}
    )) <= ${capPence}
  `
}

// Exported as a query rather than a number so a test can run it against the real migrations.
export function tabBalanceQuery(holderId: string): SQL {
  return sql`
    SELECT coalesce(sum(e.total_pence), 0) AS total FROM ledger_entries e
    WHERE e.tab_debtor_id = ${holderId} AND ${OUTSTANDING_CHARGE}
  `
}

// Every holder still carrying a balance, for the closing checklist I-203 has not built yet
// (criterion 6): this is the query that list would read, not the list itself.
export function unsettledTabsQuery(): SQL {
  return sql`
    SELECT u.id AS holderId, u.name AS holderName, sum(e.total_pence) AS outstandingPence
    FROM ledger_entries e JOIN users u ON u.id = e.tab_debtor_id
    WHERE e.tab_debtor_id IS NOT NULL AND ${OUTSTANDING_CHARGE}
    GROUP BY u.id, u.name
    HAVING sum(e.total_pence) <> 0
    ORDER BY outstandingPence DESC
  `
}

// The register's own vocabulary, which F-204 groups waste by: the operator's prose has a column
// of its own on the entry carrying the void and never lands here (0011, shared/utils/bar.ts).
export const VOID_MOVEMENT_REASON: MovementReason = 'COUNT_CORRECTION'

interface LineRow { entryId: string, productName: string, variantLabel: string, qty: number, unitPricePence: number }

// Scoped by subquery from the holder, never by a list of entry ids read back first (CLAUDE.md).
// `scope` is the caller's own charge predicate, so the read is no wider than what it will render.
export function productLinesQuery(holderId: string, scope: SQL): SQL {
  return sql`
    SELECT l.entry_id AS entryId, p.name AS productName, v.label AS variantLabel, l.qty AS qty, l.unit_price_pence AS unitPricePence
    FROM ledger_lines l
    JOIN product_variants v ON v.id = l.product_variant_id
    JOIN bar_products p ON p.id = v.product_id
    WHERE l.entry_id IN (SELECT e.id FROM ledger_entries e WHERE e.tab_debtor_id = ${holderId} AND ${scope})
      AND l.kind = 'BAR_ITEM'
  `
}

// What the account screen lists: every charge, settled or not, but never a credit or a reversal.
export const LISTED_CHARGE = sql`e.void_of_entry_id IS NULL AND e.reverses_entry_id IS NULL`

// The movements a charge's own lines caused. Scoped the same way, which also answers empty for a
// charge with no lines rather than rendering `IN ()` and failing outright.
export function chargeMovementsQuery(entryId: string): SQL {
  return sql`
    SELECT id, item_id AS itemId, qty FROM stock_movements
    WHERE ref_table = 'ledger_lines' AND ref_id IN (SELECT id FROM ledger_lines WHERE entry_id = ${entryId})
  `
}

async function productLinesFor(holderId: string, scope: SQL): Promise<Map<string, LineRow[]>> {
  const rows = await db.all<LineRow>(productLinesQuery(holderId, scope))
  const byEntry = new Map<string, LineRow[]>()
  for (const row of rows) byEntry.set(row.entryId, [...(byEntry.get(row.entryId) ?? []), row])
  return byEntry
}

function hydrate(row: ChargeRow, lines: LineRow[]): TabCharge {
  return {
    entryId: row.entryId,
    happenedAt: row.happenedAt,
    londonDay: row.londonDay,
    totalPence: row.totalPence,
    settledAt: row.settledAt,
    voided: row.voided === 1,
    lines: lines.map(line => ({ productName: line.productName, variantLabel: line.variantLabel, qty: line.qty, unitPricePence: line.unitPricePence })),
  }
}

// Every charge this holder has ever run up, settled or not, for their own account screen
// (criterion 1). Voided charges stay visible: a member should see the credit, not a gap.
export async function itemisedTab(holderId: string): Promise<ItemisedTab | null> {
  const [holder] = await db.all<{ id: string, name: string }>(sql`
    SELECT id, name FROM users WHERE id = ${holderId} AND anonymised_at IS NULL
  `)
  if (!holder) return null

  const rows = await db.all<ChargeRow>(sql`
    SELECT ${CHARGE_COLUMNS} FROM ledger_entries e
    WHERE e.tab_debtor_id = ${holderId} AND ${LISTED_CHARGE}
    ORDER BY e.happened_at DESC
  `)
  const [balance] = await db.all<{ total: number }>(tabBalanceQuery(holderId))
  const linesByEntry = await productLinesFor(holderId, LISTED_CHARGE)
  const charges = rows.map(row => hydrate(row, linesByEntry.get(row.entryId) ?? []))

  return { holderId, holderName: holder.name, outstandingPence: balance?.total ?? 0, charges }
}

// What the till's settlement screen offers: unsettled, unvoided charges only, the candidates a
// settlement may name (criteria 2, 3).
export async function outstandingTabCharges(holderId: string): Promise<TabCharge[]> {
  const rows = await db.all<ChargeRow>(sql`
    SELECT ${CHARGE_COLUMNS} FROM ledger_entries e
    WHERE e.tab_debtor_id = ${holderId} AND ${OUTSTANDING_CHARGE}
    ORDER BY e.happened_at
  `)
  const linesByEntry = await productLinesFor(holderId, OUTSTANDING_CHARGE)
  return rows.map(row => hydrate(row, linesByEntry.get(row.entryId) ?? []))
}

export async function unsettledTabsSummary(): Promise<{ holderId: string, holderName: string, outstandingPence: number }[]> {
  return db.all<{ holderId: string, holderName: string, outstandingPence: number }>(unsettledTabsQuery())
}

export interface SettlementContext {
  actorId: string
  sessionId: string
}

// Settles exactly the charges named, bounded at initiation (criterion 3): one line per charge,
// unique on the charge it settles, so a race for the same charge loses the whole batch (0003).
export async function settleTab(
  holderId: string,
  entryIds: string[],
  expectedTotalPence: number,
  context: SettlementContext,
): Promise<{ entryId: string, settledPence: number }> {
  if (entryIds.length === 0 || entryIds.length > MAX_SETTLEMENT_CHARGES) {
    throw createError({ statusCode: 400, statusMessage: 'A settlement needs between one and ninety charges' })
  }
  const uniqueIds = [...new Set(entryIds)]

  const rows = await db.all<{ id: string, totalPence: number }>(sql`
    SELECT e.id AS id, e.total_pence AS totalPence FROM ledger_entries e
    WHERE e.id IN (${sql.join(uniqueIds.map(id => sql`${id}`), sql`, `)})
      AND e.tab_debtor_id = ${holderId} AND ${OUTSTANDING_CHARGE}
  `)
  if (rows.length !== uniqueIds.length) {
    throw createError({
      statusCode: 409,
      statusMessage: 'One of those charges is no longer outstanding: it may have just been settled or voided. Nothing has been taken.',
    })
  }
  const owedPence = rows.reduce((sum, row) => sum + row.totalPence, 0)
  if (owedPence !== expectedTotalPence) {
    throw createError({
      statusCode: 409,
      statusMessage: `The screen said ${saysMoney(expectedTotalPence)}; the charges now read ${saysMoney(owedPence)}. Nothing has been taken: check the tab and try again.`,
    })
  }

  const posted = postEntry({
    source: 'TILL',
    tender: 'CARD',
    actorId: context.actorId,
    lines: rows.map(row => ({ kind: 'TAB_SETTLEMENT' as LineKind, amountPence: row.totalPence, qty: 1, settlesEntryId: row.id })),
  })
  const statements = [...posted.statements]
  statements.push(db.insert(schema.auditLog).values(auditEntry({
    actorId: context.actorId,
    action: 'bar.tab.settled',
    target: `till-session:${context.sessionId}`,
    detail: { holderId, charges: uniqueIds.length, settledPence: owedPence },
  })))

  try {
    await runLedgerBatch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  }
  catch (error) {
    if (error instanceof Error && error.message.includes('ledger_lines.settles_entry_id')) {
      throw createError({
        statusCode: 409,
        statusMessage: 'One of those charges was settled by someone else just now. Nothing has been taken: check the tab and try again.',
      })
    }
    throw error
  }

  return { entryId: posted.id, settledPence: owedPence }
}

// A settled charge is corrected by refund policy, never a void (criterion 4). A credit names its
// holder too, so the lookup says charge rather than "anything naming a debtor" (criterion 5).
export async function voidTabCharge(
  entryId: string,
  reason: string,
  actorId: string,
): Promise<{ voidEntryId: string }> {
  const [charge] = await db.all<{ id: string, tabDebtorId: string }>(sql`
    SELECT e.id AS id, e.tab_debtor_id AS tabDebtorId FROM ledger_entries e
    WHERE e.id = ${entryId} AND e.tab_debtor_id IS NOT NULL
      AND e.void_of_entry_id IS NULL AND e.reverses_entry_id IS NULL
  `)
  if (!charge) throw createError({ statusCode: 404, statusMessage: 'No such tab charge' })

  const [settled] = await db.all<{ settled: number }>(sql`
    SELECT EXISTS (SELECT 1 FROM ledger_lines WHERE settles_entry_id = ${entryId}) AS settled
  `)
  if (settled?.settled) {
    throw createError({ statusCode: 409, statusMessage: 'That charge is already settled: correct it by refund policy, not a void' })
  }

  const lines = await db.all<{ id: string, kind: LineKind, amountPence: number, qty: number, unitPricePence: number | null, productVariantId: string | null, priceRef: string | null, performanceId: string | null }>(sql`
    SELECT id, kind, amount_pence AS amountPence, qty, unit_price_pence AS unitPricePence, product_variant_id AS productVariantId, price_ref AS priceRef, performance_id AS performanceId
    FROM ledger_lines WHERE entry_id = ${entryId}
  `)
  const movements = await db.all<{ id: string, itemId: string, qty: number }>(chargeMovementsQuery(entryId))

  // Still unsettled at the moment of insert, not just at the read above: a settlement racing
  // this refuses here rather than crediting stock for a charge that was just taken (criterion 4).
  const guard = sql`NOT EXISTS (SELECT 1 FROM ledger_lines WHERE settles_entry_id = ${entryId})`
  const posted = postEntry({
    source: 'TILL',
    tender: 'TAB',
    actorId,
    // The credit is the holder's fact, not the theatre's: a ledger row crediting somebody names
    // whom it credits, as the charge names whom it charged (F-109 criterion 1).
    tabDebtorId: charge.tabDebtorId,
    voidOfEntryId: entryId,
    voidReason: reason,
    lines: lines.map(line => ({
      kind: line.kind,
      amountPence: -line.amountPence,
      qty: line.qty,
      unitPricePence: line.unitPricePence,
      productVariantId: line.productVariantId,
      priceRef: line.priceRef,
      // Carried from the charge being voided, not recomputed: the credit belongs to the same
      // performance the charge did, or to none if the charge itself named none (0058).
      performanceId: line.performanceId,
    })),
  }, new Date(), guard)

  const statements = [...posted.statements]
  // The unique index on `reverses_id` refuses a second credit for the same movement outright,
  // the named double-void regression (criterion 5). No `ref_table`/`ref_id`: `reverses_id` alone.
  for (const movement of movements) {
    statements.push(db.run(sql`
      INSERT INTO stock_movements (id, item_id, qty, kind, reason, reverses_id, actor_id)
      SELECT ${newId()}, ${movement.itemId}, ${-movement.qty}, 'REVERSAL', ${VOID_MOVEMENT_REASON}, ${movement.id}, ${actorId}
      WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE id = ${posted.id})
    `))
  }
  statements.push(db.insert(schema.auditLog).values(auditEntry({
    actorId,
    action: 'bar.tab-charge.voided',
    target: `ledger-entry:${entryId}`,
    detail: { voidEntryId: posted.id },
  })))

  try {
    await runLedgerBatch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  }
  catch (error) {
    if (error instanceof Error && (error.message.includes('ledger_entries.void_of_entry_id') || error.message.includes('stock_movements.reverses_id'))) {
      throw createError({ statusCode: 409, statusMessage: 'That charge has already been voided.' })
    }
    throw error
  }

  const [confirmed] = await db.all<{ voidOfEntryId: string | null }>(sql`SELECT void_of_entry_id AS voidOfEntryId FROM ledger_entries WHERE id = ${posted.id}`)
  if (!confirmed?.voidOfEntryId) {
    throw createError({ statusCode: 409, statusMessage: 'That charge is no longer voidable: it may have just been settled.' })
  }

  return { voidEntryId: posted.id }
}
