// Naming guests (spec part 3, rules L2 and L3): a guest is an account made from a name and email, and
// gets complimentary tickets through the guest issuer. The allocation's count is the guarded statement,
// so two contacts naming its last place at once leave one guest named and the other told it has gone (CO-04).
import { z } from 'zod'
import { first, newId, nowMs, refuse, runInContext, useContext, usePoint } from '#kit'
import type { Actor, UnitOfWork } from '#kit'
import { findOrCreateAccount } from '#modules/core'
import { LIMITS } from '../shared/companies'
import type { GuestIssuer } from './points/guest-issuer'

export interface Allocation { id: string, engagementId: string, performanceId: string, places: number, named: number, state: string, namesDueAt: number }

export const guestInput = z.object({
  name: z.string().trim().min(1).max(LIMITS.personName),
  email: z.email().max(LIMITS.email),
  places: z.number().int().min(1).max(LIMITS.places).default(1),
})

export async function requireAllocation(id: string): Promise<Allocation> {
  const allocation = await first<Allocation>(`SELECT id, engagement_id AS engagementId, performance_id AS performanceId, places, named, state,
    names_due_at AS namesDueAt FROM companies_allocations WHERE id = ?`, id)
  if (!allocation) refuse('core.not-found', 'There are no such guest places.', { status: 404 })
  return allocation
}

/** The issuer, run as its own module, so what it signs (a door code) is its own to sign. */
async function issuer(): Promise<GuestIssuer> {
  const [found] = await usePoint<GuestIssuer>('companies.guest-issuer')
  if (!found) refuse('companies.guests.no-issuer', 'Guest tickets need the box office, which is switched off.', { status: 409, remedy: 'Ask an administrator to switch on the box office.' })
  return { issue: (unit, request) => runInContext({ ...useContext(), module: found.module }, () => found.value.issue(unit, request)) }
}

export async function nameGuest(unit: UnitOfWork, actor: Actor, allocation: Allocation, input: z.infer<typeof guestInput>): Promise<{ guestId: string, orderRef: string }> {
  const at = nowMs()
  if (allocation.state !== 'open' || allocation.namesDueAt <= at)
    refuse('companies.allocation.closed', 'Guest names for this performance are closed.', { status: 409, remedy: 'Ask the box office to issue any more on the night.' })
  if (allocation.named + input.places > allocation.places)
    refuse('companies.allocation.full', 'There are not that many guest places left for this performance.', { status: 409, remedy: 'Name fewer guests, or ask the theatre for more places.' })
  unit.add({
    sql: `UPDATE companies_allocations SET named = named + ?, updated_at = ?
          WHERE id = ? AND state = 'open' AND names_due_at > ? AND named + ? <= places`,
    params: [input.places, at, allocation.id, at, input.places],
  }).expect(1, { code: 'companies.allocation.full', reason: 'Someone has just named a guest for the last place.', remedy: 'Reload to see how many places are left.' })
  const { accountId } = await findOrCreateAccount(unit, { address: input.email, name: input.name, origin: 'named-by-other' })
  const { orderRef } = await (await issuer()).issue(unit, { performanceId: allocation.performanceId, accountId, places: input.places })
  const guestId = newId('cpgu')
  unit.add({
    sql: 'INSERT INTO companies_guests (id, allocation_id, account_id, places, order_ref, state, named_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, \'issued\', ?, ?, ?)',
    params: [guestId, allocation.id, accountId, input.places, orderRef, actor.accountId ?? null, at, at],
  })
  unit.add({
    sql: 'INSERT INTO companies_engagement_events (id, engagement_id, kind, detail, actor_id, at, created_at) VALUES (?, ?, \'guest-named\', ?, ?, ?, ?)',
    params: [newId('cpev'), allocation.engagementId, JSON.stringify({ allocationId: allocation.id, guestId, places: input.places }), actor.accountId ?? null, at, at],
  })
  unit.audit({ action: 'create', record: ['companies.engagement', allocation.engagementId], detail: { allocationId: allocation.id, guestId, places: input.places } })
  return { guestId, orderRef }
}
