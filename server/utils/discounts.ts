import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import type { Discount } from '#shared/utils/discounts'

// Reading and finding a bar discount. Applying one to a sale is `server/utils/sale.ts`'s, since
// that is the one place a discount is ever charged from (F-117).

const DISCOUNT_COLUMNS = sql`d.id AS id, d.name AS name, d.percent AS percent, d.status AS status`

export async function discountById(id: string): Promise<Discount | undefined> {
  const [row] = await db.all<Discount>(sql`SELECT ${DISCOUNT_COLUMNS} FROM discounts d WHERE d.id = ${id}`)
  return row
}

export async function discountNamed(name: string, exceptId?: string): Promise<Discount | undefined> {
  const except = exceptId ? sql` AND d.id <> ${exceptId}` : sql``
  const [row] = await db.all<Discount>(sql`
    SELECT ${DISCOUNT_COLUMNS} FROM discounts d WHERE d.name = ${name} COLLATE NOCASE${except} LIMIT 1
  `)
  return row
}

export async function activeDiscounts(): Promise<Discount[]> {
  return db.all<Discount>(sql`SELECT ${DISCOUNT_COLUMNS} FROM discounts d WHERE d.status = 'ACTIVE' ORDER BY d.name COLLATE NOCASE`)
}

export async function listDiscounts(limit: number, offset: number): Promise<Discount[]> {
  return db.all<Discount>(sql`SELECT ${DISCOUNT_COLUMNS} FROM discounts d ORDER BY d.name COLLATE NOCASE LIMIT ${limit} OFFSET ${offset}`)
}

export async function countDiscounts(): Promise<number> {
  const [row] = await db.all<{ total: number }>(sql`SELECT count(*) AS total FROM discounts`)
  return row?.total ?? 0
}
