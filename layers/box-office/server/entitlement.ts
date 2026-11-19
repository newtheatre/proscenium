// Who may have a ticket type with requirements (Box office specification, part 5, "Requirements:
// member prices and the check at entry"; BO-18, BO-20). Online, each such type is checked against
// the signed-in buyer through the kit, and an unavailable source withholds it, so switching a module
// off never hands its price to everyone. The number one holder may have for a performance is the
// source's quantity when it gives one (the companions the access scheme allows) and the type's
// max_per_holder otherwise, counted over live tickets on the holder's account scope by a condition
// in the claim batch, so two baskets at once cannot each take the whole allowance. At the desk a
// seller who has checked by hand sells it under box-office.ticket-type.override-requirement, audited.
// A reference typed in place of signing in, such as a student ID on a membership list (Membership
// rules V8 to V19), is checked through the kit, which limits guessing. It meets one ticket: its
// evidence goes on the line, no other live ticket for the performance may carry the same, and it is
// checked again at the door. At the desk a seller may type the buyer's reference instead of
// overriding.
//
// At the desk every such ticket names its holder (Matt, 17 November): the seller scans the holder's
// card or finds them, and the holder's account is checked as a signed-in buyer's is, with the same
// limit for each holder. Where it is not met, a seller who may check by hand sells it anyway, still
// to that named holder, audited: there is no override without finding the person.
import { sql } from 'drizzle-orm'
import { can, refuse, requirements, useContext, type UnitView } from '#kit'
import { inAccountScope } from '#kit/accounts'
import type { TicketType } from './ticket-types'

/**
 * What was met and by whom; evidence is the source's note to keep, such as the list entry a typed
 * reference matched. The account is null for a reference whose holder the source does not know. The
 * ref is null where a seller checked by hand and sold it to the named holder anyway.
 */
export interface Requirement { ref: string | null, accountId: string | null, evidence?: string }

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
export async function entitle(performanceId: string, lines: readonly { ticketTypeId: string, reference?: string, holder?: string }[], types: Map<string, TicketType>, buyer: Buyer): Promise<Entitled> {
  const out: (Requirement | null)[] = lines.map(() => null)
  const guards: ((unit: UnitView) => void)[] = []
  const wanted = [...new Set(lines.map(l => l.ticketTypeId))].map(id => types.get(id)!).filter(t => t.requirementRefs.length)
  for (const type of wanted) {
    const count = lines.filter(l => l.ticketTypeId === type.id).length
    const mine = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.ticketTypeId === type.id)
    const typed = mine.every(({ l }) => !!l.reference)
    if (buyer.channel === 'desk' && typed) {
      await byReference(performanceId, type, mine, null, out, guards)
      continue
    }
    if (buyer.channel === 'desk') {
      await byHolder(performanceId, type, mine, buyer.account, out, guards)
      continue
    }
    const answers = await requirements.check({ accounts: [buyer.account], refs: type.requirementRefs, record: ['core.performance', performanceId], whenUnavailable: 'not-met' })
    const met = answers.find(a => a.verdict === 'met' && !a.unavailable)
    if (!met && typed && !answers.every(a => a.unavailable)) {
      await byReference(performanceId, type, mine, buyer.account, out, guards)
      continue
    }
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

/** What a holder named at the desk may have of a type: met by their account, or not, with the source's words. */
export async function holderVerdict(performanceId: string, type: Pick<TicketType, 'requirementRefs' | 'maxPerHolder'>, accountId: string): Promise<{ met: { ref: string, evidence?: string, limit: number } | null, reason: string | null, unavailable: boolean }> {
  const answers = await requirements.check({ accounts: [accountId], refs: type.requirementRefs, record: ['core.performance', performanceId], whenUnavailable: 'not-met' })
  const met = answers.find(a => a.verdict === 'met' && !a.unavailable)
  if (met) return { met: { ref: met.ref, ...(met.evidence ? { evidence: met.evidence } : {}), limit: met.quantity ?? type.maxPerHolder }, reason: null, unavailable: false }
  return { met: null, reason: answers.find(a => !a.unavailable && a.reason)?.reason ?? null, unavailable: answers.every(a => a.unavailable) }
}

const HOLDER = 'box-office.ticket-type.override-requirement'

/**
 * Each desk ticket of a type with requirements, by the holder named for it, or by a typed reference.
 * A ticket with neither takes the buyer's account where the order has one (a reservation being
 * changed); otherwise it is refused, so nobody is sold one without being named.
 */
async function byHolder(performanceId: string, type: TicketType, mine: { l: { reference?: string, holder?: string }, i: number }[], buyer: string | null, out: (Requirement | null)[], guards: ((unit: UnitView) => void)[]): Promise<void> {
  const actor = useContext().actor
  const typed = mine.filter(({ l }) => !!l.reference)
  if (typed.length) await byReference(performanceId, type, typed, null, out, guards)
  const named = mine.filter(({ l }) => !l.reference).map(({ l, i }) => ({ i, holder: l.holder ?? buyer }))
  if (named.some(n => !n.holder))
    refuse('box-office.requirement.holder', `Each ${type.name} ticket is for someone who qualifies: scan their card or find them first.`, { status: 422, remedy: 'Name who each ticket is for, or sell another kind of ticket.', fields: { holder: 'missing' } })
  const byAccount = new Map<string, number[]>()
  for (const n of named) byAccount.set(n.holder!, [...(byAccount.get(n.holder!) ?? []), n.i])
  for (const [account, indexes] of byAccount) {
    const verdict = await holderVerdict(performanceId, type, account)
    if (!verdict.met) {
      // Checked by hand: sold to the named holder, with nothing kept to check again at the door.
      if (!(await can(actor, HOLDER, ['core.performance', performanceId])).allowed)
        refuse('box-office.requirement.desk', verdict.reason ?? `${type.name} tickets are for people who qualify, and this person does not, as far as we can tell.`, { status: 403, remedy: 'Ask a box office manager to check by hand, or sell another kind of ticket.', fields: { holder: 'not-met' } })
      for (const i of indexes) out[i] = { ref: null, accountId: account }
      guards.push(unit => unit.audit({ action: 'state', ability: HOLDER, record: ['core.performance', performanceId], detail: { ticketTypeId: type.id, tickets: indexes.length, holder: account } }))
      continue
    }
    const { ref, evidence, limit } = verdict.met
    const tooMany = { code: 'box-office.requirement.limit', reason: limit === 0 ? `This person cannot have ${type.name} tickets for this performance.` : `This person can have at most ${limit} ${type.name} ${limit === 1 ? 'ticket' : 'tickets'} for this performance, counting any they already hold.`, remedy: 'Choose fewer, or another kind of ticket.' }
    if (indexes.length > limit) refuse(tooMany.code, tooMany.reason, { status: 422, remedy: tooMany.remedy, fields: { holder: 'limit' } })
    for (const i of indexes) out[i] = { ref, accountId: account, ...(evidence ? { evidence } : {}) }
    guards.push(unit => unit.add(sql`UPDATE box_office_performance_sales SET updated_at = updated_at WHERE performance_id = ${performanceId}
      AND (SELECT count(*) FROM box_office_order_lines l JOIN box_office_claims c ON c.id = l.claim_id
        WHERE l.performance_id = ${performanceId} AND l.ticket_type_id = ${type.id} AND l.state = 'live' AND c.state IN ('held', 'confirmed')
          AND ${inAccountScope('l.requirement_account_id', account)}) + ${indexes.length} <= ${limit}`).expect(1, tooMany))
  }
}

const REFERENCE_USED = { code: 'box-office.requirement.reference-used', reason: 'That reference has already been used for a ticket to this performance.', remedy: 'Each one is for one ticket. Have a membership? Contact us.' }

/**
 * Each ticket of a type met by a typed reference rather than by the buyer's account: the reference
 * is checked through the kit, and its evidence goes on the line. One reference meets one ticket, here
 * and at this performance, which the claim batch holds to on the statement.
 */
async function byReference(performanceId: string, type: TicketType, mine: { l: { reference?: string }, i: number }[], account: string | null, out: (Requirement | null)[], guards: ((unit: UnitView) => void)[]): Promise<void> {
  const seen = new Set<string>()
  for (const { l, i } of mine) {
    const value = l.reference!
    const answers = await requirements.check({ accounts: [account], refs: type.requirementRefs, presented: type.requirementRefs.map(ref => ({ ref, value })), record: ['core.performance', performanceId], whenUnavailable: 'not-met' })
    const met = answers.find(a => a.verdict === 'met' && !a.unavailable && a.evidence)
    if (!met) {
      const said = answers.find(a => a.reason)
      refuse('box-office.requirement.reference-not-met', said?.reason ?? `That reference does not give a ${type.name} ticket.`, { status: 403, remedy: 'Check it, or choose another kind of ticket.', fields: { reference: 'not-met' } })
    }
    const evidence = met.evidence!
    if (seen.has(evidence)) refuse(REFERENCE_USED.code, `The same reference is given for two ${type.name} tickets.`, { status: 422, remedy: 'Each one is for one ticket.', fields: { reference: 'repeated' } })
    seen.add(evidence)
    out[i] = { ref: met.ref, accountId: met.holderAccountId ?? account, evidence }
    guards.push(unit => unit.add(sql`UPDATE box_office_performance_sales SET updated_at = updated_at WHERE performance_id = ${performanceId}
      AND NOT EXISTS (SELECT 1 FROM box_office_order_lines l JOIN box_office_claims c ON c.id = l.claim_id
        WHERE l.performance_id = ${performanceId} AND l.requirement_evidence_id = ${evidence} AND l.state = 'live' AND c.state IN ('held', 'confirmed'))`).expect(1, REFERENCE_USED))
  }
}
