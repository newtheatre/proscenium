// Passes reconstructed from what the old estate kept as odd tickets (0073): a sale becomes a
// pass with a price point, an admission becomes a pass_admissions row on the seat it spent.
import { NOT_ANONYMISED, idFor, nanoid } from './lib'
import { committeeYearEnd, committeeYearOf } from '../shared/utils/london'
import { generateReservationReference } from '../shared/utils/reservations'
import type { PassAdmissionSeat, PassSale } from './reservations'
import type { Database } from 'bun:sqlite'

export interface OldTicketTypeName { id: string, name: string }

export interface PassesInput {
  sales: readonly PassSale[]
  admissions: readonly PassAdmissionSeat[]
  // Old ticket type id to its old name, which is the only record of which product it was.
  oldTicketTypes: readonly OldTicketTypeName[]
  // Unified performance id to when it starts and which show it belongs to.
  performances: Map<string, { startsAt: number, showId: string }>
  passTypeIds: Map<string, string>
  passPriceIds: Map<string, string>
  passIds: Map<string, string>
  admissionIds: Map<string, string>
  target: Database
  now?: number
}

export interface PassesSummary {
  passTypes: number
  pricePoints: number
  passes: number
  passesFromSales: number
  passesFromAdmissionsOnly: number
  // A second seat on the same performance for one holder means a second pass, never a merge.
  passesForOverflowAdmissions: number
  salesWithoutHolder: number
  admissionsWritten: number
  admissionsWithoutHolder: number
  salePence: number
  [key: string]: number
}

// "Season Ticket, NNT (sold)" and "Season Ticket (admission)" are one product at two price
// labels; the suffix says whether the row was money or a seat, which reservations.ts already knows.
export function productOf(oldTypeName: string): { product: string, label: string | null } {
  const bare = oldTypeName.replace(/\s*\((sold|admission)\)\s*$/i, '').trim()
  const [product, label] = bare.split(/,\s*/, 2)
  return { product: product!.trim(), label: label?.trim() || null }
}

export function slugOf(product: string, year: number): string {
  return `${product.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '')}-${year - 1}-${year}`
}

const pounds = (pence: number): string => `£${(pence / 100).toFixed(2)}`

function freshReference(used: Set<string>): string {
  let candidate = generateReservationReference()
  while (used.has(candidate)) candidate = generateReservationReference()
  used.add(candidate)
  return candidate
}

export function transformPasses(input: PassesInput): { summary: PassesSummary, exceptions: string[] } {
  const { sales, admissions, performances, passTypeIds, passPriceIds, passIds, admissionIds, target } = input
  const now = input.now ?? Math.floor(Date.now() / 1000)
  const exceptions: string[] = []
  const summary: PassesSummary = {
    passTypes: 0, pricePoints: 0, passes: 0, passesFromSales: 0, passesFromAdmissionsOnly: 0, passesForOverflowAdmissions: 0,
    salesWithoutHolder: 0, admissionsWritten: 0, admissionsWithoutHolder: 0, salePence: 0,
  }
  const typeNames = new Map(input.oldTicketTypes.map(type => [type.id, type.name]))
  const productFor = (oldTypeId: string) => productOf(typeNames.get(oldTypeId) ?? oldTypeId)

  // One pass per sale; an admission joins the holder's pass for that product and committee year
  // that has not yet admitted to its performance, or mints an admissions-only pass when none has.
  interface Held { userId: string, product: string, year: number, index: number, sale: PassSale | null, label: string | null, admissions: PassAdmissionSeat[], performances: Set<string> }
  const groups = new Map<string, Held[]>()
  const groupKey = (userId: string, product: string, year: number) => `${userId}|${product}|${year}`
  const mint = (userId: string, product: string, year: number, sale: PassSale | null, label: string | null): Held => {
    const list = groups.get(groupKey(userId, product, year)) ?? []
    const pass: Held = { userId, product, year, index: list.length, sale, label, admissions: [], performances: new Set() }
    list.push(pass)
    groups.set(groupKey(userId, product, year), list)
    return pass
  }

  const bySold = [...sales].sort((a, b) => a.soldAt - b.soldAt || a.oldTicketId.localeCompare(b.oldTicketId))
  for (const sale of bySold) {
    if (!sale.userId) {
      summary.salesWithoutHolder++
      exceptions.push(`pass sale ${sale.oldTicketId}: no holder account, not reconstructed`)
      continue
    }
    const { product, label } = productFor(sale.oldTicketTypeId)
    mint(sale.userId, product, committeeYearOf(new Date(sale.soldAt * 1000)), sale, label)
  }

  const byAdmitted = [...admissions].sort((a, b) => a.admittedAt - b.admittedAt || a.oldTicketId.localeCompare(b.oldTicketId))
  for (const admission of byAdmitted) {
    if (!admission.userId) {
      summary.admissionsWithoutHolder++
      exceptions.push(`pass admission ${admission.oldTicketId}: no holder account, the seat stays a plain pass-admission ticket`)
      continue
    }
    const performance = performances.get(admission.performanceId)
    if (!performance) {
      summary.admissionsWithoutHolder++
      exceptions.push(`pass admission ${admission.oldTicketId}: performance ${admission.performanceId} unknown to the programme`)
      continue
    }
    const { product } = productFor(admission.oldTicketTypeId)
    const year = committeeYearOf(new Date(performance.startsAt * 1000))
    const list = groups.get(groupKey(admission.userId, product, year)) ?? []
    let pass = list.find(candidate => !candidate.performances.has(admission.performanceId))
    if (!pass) {
      pass = mint(admission.userId, product, year, null, null)
      if (list.length) summary.passesForOverflowAdmissions++
    }
    pass.admissions.push(admission)
    pass.performances.add(admission.performanceId)
  }
  const held = [...groups.values()].flat()

  const insertType = target.prepare(`
    INSERT INTO pass_types (id, slug, name, description, status, valid_from, valid_until, sales_open_at, sales_close_at, max_issued)
    VALUES (?, ?, ?, 'Imported from the old estate.', 'CLOSED', ?, ?, NULL, NULL, NULL)
    ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, name = excluded.name, valid_from = excluded.valid_from, valid_until = excluded.valid_until
  `)
  const insertPrice = target.prepare(`
    INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET label = excluded.label, price = excluded.price
  `)
  const insertPass = target.prepare(`
    INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      pass_type_id = excluded.pass_type_id, pass_type_price_id = excluded.pass_type_price_id, user_id = excluded.user_id,
      price_paid = excluded.price_paid, status = excluded.status, notes = excluded.notes, updated_at = excluded.updated_at
    WHERE ${NOT_ANONYMISED('passes')}
  `)
  const insertShow = target.prepare(`
    INSERT INTO pass_type_shows (id, pass_type_id, show_id) VALUES (?, ?, ?)
    ON CONFLICT (pass_type_id, show_id) DO NOTHING
  `)
  // Append-only (0010): never DO UPDATE, and the id is kept so the same admission lands once.
  const insertAdmission = target.prepare(`
    INSERT INTO pass_admissions (id, pass_id, performance_id, ticket_id, admitted_at, admitted_by)
    VALUES (?, ?, ?, ?, ?, NULL)
    ON CONFLICT (id) DO NOTHING
  `)

  const usedReferences = new Set(target.query<{ reference: string }, []>('SELECT reference FROM passes').all().map(row => row.reference))
  const typesWritten = new Set<string>()
  const pricesWritten = new Set<string>()
  for (const pass of held) {
    const typeKey = `${pass.product}|${pass.year}`
    const typeId = idFor(passTypeIds, typeKey)
    if (!typesWritten.has(typeKey)) {
      const from = Math.floor(committeeYearEnd(pass.year - 1).getTime() / 1000) + 1
      const until = Math.floor(committeeYearEnd(pass.year).getTime() / 1000)
      insertType.run(typeId, slugOf(pass.product, pass.year), `${pass.product} ${pass.year - 1}/${String(pass.year).slice(-2)}`, from, until)
      typesWritten.add(typeKey)
      summary.passTypes++
    }

    const price = pass.sale?.pricePaid ?? 0
    const label = pass.sale ? `${pounds(price)}${pass.label ? `, ${pass.label}` : ''} (imported)` : 'Sale not recorded'
    const priceKey = `${typeKey}|${label}`
    const priceId = idFor(passPriceIds, priceKey)
    if (!pricesWritten.has(priceKey)) {
      insertPrice.run(priceId, typeId, label, price)
      pricesWritten.add(priceKey)
      summary.pricePoints++
    }

    const passId = idFor(passIds, `${groupKey(pass.userId, pass.product, pass.year)}|${pass.index}`)
    const existing = target.query('SELECT reference FROM passes WHERE id = ?').get(passId) as { reference: string } | null
    const reference = existing?.reference ?? freshReference(usedReferences)
    const createdAt = pass.sale?.soldAt ?? Math.min(...pass.admissions.map(admission => admission.admittedAt))
    const until = Math.floor(committeeYearEnd(pass.year).getTime() / 1000)
    const notes = pass.sale ? null : `Reconstructed from ${pass.admissions.length} admission(s); no sale recorded.`
    insertPass.run(passId, reference, typeId, priceId, pass.userId, price, until < now ? 'EXPIRED' : 'ACTIVE', notes, createdAt, createdAt)
    summary.passes++
    if (pass.sale) {
      summary.passesFromSales++
      summary.salePence += price
    }
    else {
      summary.passesFromAdmissionsOnly++
    }

    for (const admission of pass.admissions) {
      const performance = performances.get(admission.performanceId)!
      insertShow.run(nanoid(), typeId, performance.showId)
      insertAdmission.run(idFor(admissionIds, admission.oldTicketId), passId, admission.performanceId, admission.ticketId, admission.admittedAt)
      summary.admissionsWritten++
    }
  }

  return { summary, exceptions }
}

export interface Reconciliation { ok: boolean, problems: string[] }

export function reconcilePasses(target: Database, input: PassesInput, summary: PassesSummary): Reconciliation {
  const problems: string[] = []
  const accountedSales = summary.passesFromSales + summary.salesWithoutHolder
  if (accountedSales !== input.sales.length) problems.push(`read ${input.sales.length} pass sales but accounted for ${accountedSales}`)
  const accountedAdmissions = summary.admissionsWritten + summary.admissionsWithoutHolder
  if (accountedAdmissions !== input.admissions.length) problems.push(`read ${input.admissions.length} pass admissions but accounted for ${accountedAdmissions}`)
  const landed = (target.query('SELECT count(*) AS n FROM passes').get() as { n: number }).n
  if (landed < summary.passes) problems.push(`wrote ${summary.passes} passes but ${landed} are in the target`)
  const paid = (target.query('SELECT coalesce(sum(price_paid), 0) AS total FROM passes').get() as { total: number }).total
  if (paid < summary.salePence) problems.push(`pass sales total ${summary.salePence}p, ${paid}p in the target`)
  return { ok: problems.length === 0, problems }
}
