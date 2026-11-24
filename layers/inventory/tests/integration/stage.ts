// Shared set-up for the inventory tests: the module on, kit departments, categories, a store and
// items written as setup would, loans made through the server, and a way to try a write and see
// what it answered.
import { changeSetting, createUnit, isRefusal, newId, setClock, type UnitView } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { inContext, rows, setModule } from '../../../../tests/integration/helpers'
import { getLoan, insertLoan, addLine, type Loan, type NewLoan } from '../../server/loans'
import type { LendsTo } from '../../shared/states'

export const NOV_24 = Date.UTC(2026, 10, 24, 9)
export const HOUR = 3_600_000
export const DAY = 24 * HOUR
/** A Tuesday in January 2027, 00:00 in London (no clock change near it). */
export const JAN_12 = Date.UTC(2027, 0, 12)
export const day = (n: number) => new Date(JAN_12 + n * DAY).toISOString().slice(0, 10)
export const at = (n: number, hour = 10) => JAN_12 + n * DAY + hour * HOUR

export async function ready(): Promise<void> {
  setClock(NOV_24)
  resetRateLimits()
  await setModule('inventory', true)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    await unit.commit()
  })
}

let n = 0
const stamp = () => Date.now()

export interface Shelf { departmentId: string, categoryId: string, locationId: string }

/** A kit department with one category and one store, as setup would write them. */
export async function shelf(lendsTo: LendsTo = 'anyone'): Promise<Shelf> {
  n++
  const departmentId = newId('kdp')
  const categoryId = newId('kcat')
  const locationId = newId('kloc')
  const prefix = `T${String.fromCharCode(65 + (n % 26))}${String.fromCharCode(65 + Math.floor(n / 26) % 26)}`
  await rows('INSERT INTO inventory_departments (id, name, tag_prefix, lends_to, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', departmentId, `Department ${n}`, prefix, lendsTo, stamp(), stamp())
  await rows('INSERT INTO inventory_categories (id, department_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', categoryId, departmentId, `Category ${n}`, stamp(), stamp())
  await rows('INSERT INTO inventory_locations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', locationId, `Store ${n}`, stamp(), stamp())
  return { departmentId, categoryId, locationId }
}

/** An item in the shelf's category: individual unless a quantity is given. */
export async function item(s: Shelf, fields: { quantity?: number, containerId?: string, state?: string } = {}): Promise<string> {
  const id = newId('kit')
  const counted = fields.quantity !== undefined
  await rows('INSERT INTO inventory_items (id, category_id, tag, name, tracking, quantity, home_location_id, container_id, state, out_of_service_reason, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'GBP\', ?, ?)',
    id, s.categoryId, `T-${++n}`, `Item ${n}`, counted ? 'counted' : 'individual', fields.quantity ?? 1, s.locationId, fields.containerId ?? null, fields.state ?? 'active', fields.state === 'out-of-service' ? 'by-hand' : null, stamp(), stamp())
  return id
}

export const member = () => newId('acc')

/** Runs one write in its own unit and answers 'ok' or the refusal's code. */
export async function attempt(write: (unit: UnitView) => unknown | Promise<unknown>): Promise<string> {
  try {
    await inContext(async () => {
      const unit = createUnit()
      await write(unit.view())
      await unit.commit()
    })
    return 'ok'
  }
  catch (error) {
    if (isRefusal(error)) return (error as any).code
    throw error
  }
}

/** A requested loan from the shelf's department, from day `from` 10:00 to the close of day `to`, with these lines. */
export async function request(s: Shelf, from: number, to: number, lines: { itemId: string, quantity?: number }[], fields: Partial<NewLoan> = {}): Promise<Loan> {
  let id = ''
  const who = member()
  const outcome = await attempt(async (unit) => {
    id = await insertLoan(unit, { departmentId: s.departmentId, kind: 'member', state: 'requested', responsibleAccountId: who, startsAt: at(from), dueBackOn: day(to), requestedBy: who, ...fields })
    const loan = { id, departmentId: s.departmentId, kind: 'member', state: 'requested', startsAt: at(from), dueBackOn: day(to), dueBackAt: 0, responsibleAccountId: who } as Loan
    for (const line of lines) addLine(unit, loan, line)
  })
  if (outcome !== 'ok') throw new Error(`request refused: ${outcome}`)
  return (await inContext(() => getLoan(id)))!
}

export const promised = (itemId: string) => rows<{ loan_id: string, quantity: number, starts_at: number, due_back_at: number }>(
  'SELECT l.loan_id, l.quantity, o.starts_at, o.due_back_at FROM inventory_loan_lines l JOIN inventory_loans o ON o.id = l.loan_id WHERE l.item_id = ? AND l.state IN (\'promised\', \'out\') ORDER BY o.starts_at', itemId)
