// Who may have a ticket type with requirements (Box office specification, part 5, "Requirements:
// member prices and the check at entry"; BO-18, BO-20). Online, each such type is checked against
// the signed-in buyer through the kit, and an unavailable source withholds it, so switching a module
// off never hands its price to everyone. The number one holder may have for a performance is the
// source's quantity when it gives one (the companions the access scheme allows) and the type's
// max_per_holder otherwise, counted over live tickets on the holder's account scope by a condition
// in the claim batch, so two baskets at once cannot each take the whole allowance. At the desk a
// seller who has checked by hand sells it under box-office.ticket-type.override-requirement, audited.
// A value typed in place of signing in (a student ID) is not taken yet.
import { sql } from 'drizzle-orm'
import { can, refuse, requirements, useContext, type UnitView } from '#kit'
import { inAccountScope } from '#kit/accounts'
import type { TicketType } from './ticket-types'

/** What was met and by whom; evidence is the source's note to keep, such as "pending" for an access application not yet decided. */
export interface Requirement { ref: string, accountId: string, evidence?: string }

export interface Entitled {
  /** For each line, in the order given: what was met and by whom, or null for none needed or overridden. */
  requirements: (Requirement | null)[]
  /** Adds the holder limits and the override's audit to the unit that writes the lines. */
  guard: (unit: UnitView) => void
}

export interface Buyer {
  channel: 'online' | 'desk'
  /** The buyer's account, when known: the signed-in buyer online. */
  account: string | null
}

/** Checks every ticket of a type with requirements, or refuses. Reads only; the limits ride `guard`. */
export async function entitle(performanceId: string, lines: readonly { ticketTypeId: string }[], types: Map<string, TicketType>, buyer: Buyer): Promise<Entitled> {
  const out: (Requirement | null)[] = lines.map(() => null)
  const guards: ((unit: UnitView) => void)[] = []
  const wanted = [...new Set(lines.map(l => l.ticketTypeId))].map(id => types.get(id)!).filter(t => t.requirementRefs.length)
  const actor = useContext().actor
  for (const type of wanted) {
    const count = lines.filter(l => l.ticketTypeId === type.id).length
    if (buyer.channel === 'desk') {
      const allowed = (await can(actor, 'box-office.ticket-type.override-requirement', ['core.performance', performanceId])).allowed
      if (!allowed) refuse('box-office.requirement.desk', `${type.name} tickets are for people who qualify, and selling them at the desk needs someone who may check that by hand.`, { status: 403, remedy: 'Ask a box office manager, or sell another kind of ticket.' })
      guards.push(unit => unit.audit({ action: 'state', ability: 'box-office.ticket-type.override-requirement', record: ['core.performance', performanceId], detail: { ticketTypeId: type.id, tickets: count } }))
      continue
    }
    const answers = await requirements.check({ accounts: [buyer.account], refs: type.requirementRefs, record: ['core.performance', performanceId], whenUnavailable: 'not-met' })
    const met = answers.find(a => a.verdict === 'met' && !a.unavailable)
    if (!met) {
      if (answers.every(a => a.unavailable)) refuse('box-office.requirement.unavailable', `${type.name} tickets are not on sale just now.`, { status: 409, remedy: 'Choose another kind of ticket.' })
      const said = answers.find(a => !a.unavailable && a.reason)
      refuse('box-office.requirement.not-met', said?.reason ?? `${type.name} tickets are only for people who qualify for them.`, {
        status: 403,
        remedy: buyer.account ? 'Choose another kind of ticket.' : 'Sign in first if you qualify, or choose another kind of ticket.',
      })
    }
    const limit = met.quantity ?? type.maxPerHolder
    const tooMany = { code: 'box-office.requirement.limit', reason: limit === 0 ? `You cannot have ${type.name} tickets for this performance.` : `You can have at most ${limit} ${type.name} ${limit === 1 ? 'ticket' : 'tickets'} for this performance, counting any you already hold.`, remedy: 'Choose fewer, or another kind of ticket.' }
    if (count > limit) refuse(tooMany.code, tooMany.reason, { status: 422, remedy: tooMany.remedy })
    const account = buyer.account!
    lines.forEach((l, i) => {
      if (l.ticketTypeId === type.id) out[i] = { ref: met.ref, accountId: account, ...(met.evidence ? { evidence: met.evidence } : {}) }
    })
    // Live tickets of this type this holder already has for the performance, plus these, within the limit.
    guards.push(unit => unit.add(sql`UPDATE box_office_performance_sales SET updated_at = updated_at WHERE performance_id = ${performanceId}
      AND (SELECT count(*) FROM box_office_order_lines l JOIN box_office_claims c ON c.id = l.claim_id
        WHERE l.performance_id = ${performanceId} AND l.ticket_type_id = ${type.id} AND l.state = 'live' AND c.state IN ('held', 'confirmed')
          AND ${inAccountScope('l.requirement_account_id', account)}) + ${count} <= ${limit}`).expect(1, tooMany))
  }
  return { requirements: out, guard: unit => guards.forEach(g => g(unit)) }
}
