import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

// Reading pass products to sell, requests waiting to be fulfilled, and what a member already
// holds (D-124). Kept apart from server/utils/pass-issue.ts's write path, matching D-114's own
// collect/desk split, so tests/ can import these under Bun.

export interface SellablePassPrice {
  id: string
  label: string
  price: number
}

export interface SellablePassType {
  id: string
  name: string
  description: string | null
  status: string
  salesOpenAt: number | null
  salesCloseAt: number | null
  maxIssued: number | null
  issuedCount: number
  prices: SellablePassPrice[]
}

// Every column the desk and the request screen both need, priced points and the live count
// against the cap in their own correlated subqueries so no join multiplies the product row (0006).
export function sellablePassTypesQuery(): SQL {
  return sql`
    SELECT t.id AS id, t.name AS name, t.description AS description, t.status AS status,
           t.sales_open_at AS salesOpenAt, t.sales_close_at AS salesCloseAt, t.max_issued AS maxIssued,
           (SELECT count(*) FROM passes p WHERE p.pass_type_id = t.id AND p.status != 'CANCELLED') AS issuedCount,
           COALESCE((
             SELECT json_group_array(json_object('id', pr.id, 'label', pr.label, 'price', pr.price))
             FROM pass_type_prices pr WHERE pr.pass_type_id = t.id
           ), '[]') AS pricesJson
    FROM pass_types t
    WHERE t.status = 'ON_SALE'
    ORDER BY t.name COLLATE NOCASE
  `
}

interface SellablePassTypeRow {
  id: string
  name: string
  description: string | null
  status: string
  salesOpenAt: number | null
  salesCloseAt: number | null
  maxIssued: number | null
  issuedCount: number
  pricesJson: string
}

export async function sellablePassTypes(): Promise<SellablePassType[]> {
  const rows = await db.all<SellablePassTypeRow>(sellablePassTypesQuery())
  return rows.map(row => ({ ...row, prices: JSON.parse(row.pricesJson) as SellablePassPrice[] }))
}

export interface PassTypeForSale {
  id: string
  name: string
  status: string
  salesOpenAt: number | null
  salesCloseAt: number | null
  maxIssued: number | null
  issuedCount: number
}

export function passTypeForSaleQuery(id: string): SQL {
  return sql`
    SELECT t.id AS id, t.name AS name, t.status AS status,
           t.sales_open_at AS salesOpenAt, t.sales_close_at AS salesCloseAt, t.max_issued AS maxIssued,
           (SELECT count(*) FROM passes p WHERE p.pass_type_id = t.id AND p.status != 'CANCELLED') AS issuedCount
    FROM pass_types t WHERE t.id = ${id}
  `
}

export async function passTypeForSale(id: string): Promise<PassTypeForSale | undefined> {
  const [row] = await db.all<PassTypeForSale>(passTypeForSaleQuery(id))
  return row
}

export interface PassTypePriceRow {
  id: string
  passTypeId: string
  label: string
  price: number
}

export async function passTypePriceById(id: string): Promise<PassTypePriceRow | undefined> {
  const [row] = await db.all<PassTypePriceRow>(sql`
    SELECT id AS id, pass_type_id AS passTypeId, label AS label, price AS price FROM pass_type_prices WHERE id = ${id}
  `)
  return row
}

export interface PendingPassRequest {
  id: string
  userId: string
  name: string
  createdAt: number
}

// By name, for the desk's one-tap fulfilment (criterion 3): oldest first, so a request does not
// wait behind one that arrived after it.
export function pendingPassRequestsQuery(passTypeId: string): SQL {
  return sql`
    SELECT r.id AS id, r.user_id AS userId, u.name AS name, r.created_at AS createdAt
    FROM pass_requests r
    JOIN users u ON u.id = r.user_id
    WHERE r.pass_type_id = ${passTypeId} AND r.status = 'PENDING'
    ORDER BY r.created_at
  `
}

export async function pendingPassRequests(passTypeId: string): Promise<PendingPassRequest[]> {
  return db.all<PendingPassRequest>(pendingPassRequestsQuery(passTypeId))
}

export interface PassRequestRow {
  id: string
  passTypeId: string
  userId: string
  status: string
}

export async function passRequestById(id: string): Promise<PassRequestRow | undefined> {
  const [row] = await db.all<PassRequestRow>(sql`
    SELECT id AS id, pass_type_id AS passTypeId, user_id AS userId, status AS status FROM pass_requests WHERE id = ${id}
  `)
  return row
}

export interface HeldPass {
  id: string
  reference: string
  passTypeName: string
  priceLabel: string
  pricePaid: number
  status: string
  createdAt: number
}

// A member's own held passes (criterion 5), and separately their own pending requests: a
// request is not a pass, so the two never share one row.
export function heldPassesQuery(userId: string): SQL {
  return sql`
    SELECT p.id AS id, p.reference AS reference, t.name AS passTypeName, pr.label AS priceLabel,
           p.price_paid AS pricePaid, p.status AS status, p.created_at AS createdAt
    FROM passes p
    JOIN pass_types t ON t.id = p.pass_type_id
    JOIN pass_type_prices pr ON pr.id = p.pass_type_price_id
    WHERE p.user_id = ${userId}
    ORDER BY p.created_at DESC
  `
}

export async function heldPasses(userId: string): Promise<HeldPass[]> {
  return db.all<HeldPass>(heldPassesQuery(userId))
}

export interface OwnPassRequest {
  id: string
  passTypeName: string
  status: string
  createdAt: number
}

export function ownPassRequestsQuery(userId: string): SQL {
  return sql`
    SELECT r.id AS id, t.name AS passTypeName, r.status AS status, r.created_at AS createdAt
    FROM pass_requests r
    JOIN pass_types t ON t.id = r.pass_type_id
    WHERE r.user_id = ${userId}
    ORDER BY r.created_at DESC
  `
}

export interface PassCurrentState {
  id: string
  reference: string
  userId: string
  passTypeName: string
  priceLabel: string
  pricePaid: number
  status: string
}

// What the QR answers when it is presented, read live rather than from anything saved earlier,
// the same shape D-108's reservation retrieval uses (server/utils/reservations.ts).
export function passCurrentStateQuery(id: string): SQL {
  return sql`
    SELECT p.id AS id, p.reference AS reference, p.user_id AS userId, t.name AS passTypeName,
           pr.label AS priceLabel, p.price_paid AS pricePaid, p.status AS status
    FROM passes p
    JOIN pass_types t ON t.id = p.pass_type_id
    JOIN pass_type_prices pr ON pr.id = p.pass_type_price_id
    WHERE p.id = ${id}
  `
}

export async function passCurrentState(id: string): Promise<PassCurrentState | undefined> {
  const [row] = await db.all<PassCurrentState>(passCurrentStateQuery(id))
  return row
}

export interface PassBuyer {
  id: string
  name: string
  email: string
}

const contains = (term: string): string => `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`

// K-123 criterion 1: a buyer is chosen by name or email, never typed as an id. Column
// allow-listed, since an ordinary desk officer issuing a pass holds no accounts.read.
export function passBuyersQuery(q: string): SQL {
  const term = contains(q)
  return sql`
    SELECT id AS id, name AS name, email AS email FROM users
    WHERE disabled = 0 AND anonymised_at IS NULL
      AND (name LIKE ${term} ESCAPE '\\' OR email LIKE ${term} ESCAPE '\\')
    ORDER BY name COLLATE NOCASE
    LIMIT 20
  `
}

export async function passBuyers(q: string): Promise<PassBuyer[]> {
  return db.all<PassBuyer>(passBuyersQuery(q))
}

export async function ownPassRequests(userId: string): Promise<OwnPassRequest[]> {
  return db.all<OwnPassRequest>(ownPassRequestsQuery(userId))
}
