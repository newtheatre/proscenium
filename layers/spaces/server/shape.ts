// What a person is shown of a check and what the form offers them: blockers are named only as far
// as rule K2 lets them read, and only purposes open to them are offered (rule P2).
import { all, can, fact, nowMs, useSetting, type Actor } from '#kit'
import { bookablesFor } from './reading'
import type { Verdict } from './rules'

export interface ShownBlocker { kind: 'booking' | 'performance' | 'closure' | 'use', startsAt: number, endsAt: number, label?: string }

/** A verdict for the screen: a booking in the way is named only to people who may read it (C3, K2). */
export async function shapeVerdict(actor: Actor, bookableId: string, verdict: Verdict) {
  const staff = (await can(actor, 'spaces.booking.view', ['spaces.bookable', bookableId])).allowed
  const details = await useSetting('spaces.calendar.show-details') as 'full' | 'purpose' | 'busy'
  const blockers: ShownBlocker[] = []
  for (const b of verdict.blockers) {
    if (b.kind !== 'booking') {
      blockers.push({ kind: b.kind, startsAt: b.startsAt, endsAt: b.endsAt })
      continue
    }
    const mine = b.bookedFor === actor.accountId
    blockers.push({ kind: 'booking', startsAt: b.startsAt, endsAt: b.endsAt, ...(mine || staff || details !== 'busy' ? { label: 'shown' } : {}) })
  }
  // Labels are worked out in one read: a performance's production, a closure's title, a booking's purpose.
  const ids = verdict.blockers.map(b => b.id)
  if (ids.length) {
    const names = new Map((await all<{ id: string, label: string }>(
      `SELECT b.id, CASE WHEN ? THEN b.title ELSE p.name END AS label FROM spaces_bookings b JOIN spaces_purposes p ON p.id = b.purpose_id WHERE b.id IN (SELECT value FROM json_each(?))
       UNION ALL SELECT f.id, pr.title FROM core_performances f JOIN core_productions pr ON pr.id = f.production_id WHERE f.id IN (SELECT value FROM json_each(?))
       UNION ALL SELECT c.id, c.title FROM core_closures c WHERE c.id IN (SELECT value FROM json_each(?))`,
      staff || details === 'full' ? 1 : 0, JSON.stringify(ids), JSON.stringify(ids), JSON.stringify(ids))).map(r => [r.id, r.label]))
    verdict.blockers.forEach((b, i) => {
      const shown = blockers[i]!
      if (b.kind !== 'booking' || shown.label) shown.label = names.get(b.id)
    })
  }
  return {
    outcome: verdict.outcome,
    rule: verdict.rule ?? null,
    code: verdict.code ?? null,
    reason: verdict.reason ?? null,
    remedy: verdict.remedy ?? null,
    figure: verdict.figure ?? null,
    external: verdict.external,
    blockers,
    nearest: verdict.nearest ?? null,
    waiting: verdict.waiting,
    overridden: verdict.overridden,
  }
}

/** What the Book a room form offers this person (part 5, "Book a room"). */
export async function formOptions(actor: Actor) {
  const bookables = (await bookablesFor(actor)).filter(b => b.may.request && b.state === 'active')
  const purposes = await all<{ id: string, name: string, description: string | null, tier: number, open_to: string, needs_production: number, approval: string, may_repeat: number }>(
    'SELECT id, name, description, tier, open_to, needs_production, approval, may_repeat FROM spaces_purposes WHERE state = \'active\' ORDER BY tier, sort, lower(name)')
  const here = await all<{ bookable_id: string, purpose_id: string, allowed: number, approval: string | null }>('SELECT bookable_id, purpose_id, allowed, approval FROM spaces_bookable_purposes')
  const productions = await teamProductions(actor)
  const staffAnywhere = bookables.some(b => b.may.manage)
  const offered = purposes.filter(p => p.open_to === 'bookers' || (p.open_to === 'staff' && staffAnywhere) || (p.open_to === 'production-team' && (productions.length || staffAnywhere)))
  return {
    bookables: bookables.map(b => ({
      id: b.id,
      name: b.name,
      kind: b.kind,
      venueName: b.venueName,
      external: b.control === 'external',
      approvalNote: b.approvalNote,
      guidance: b.guidance,
      capacity: b.capacity,
      colour: b.colour,
      manage: b.may.manage,
      override: b.may.override,
      purposes: offered.filter(p => !here.some(h => h.bookable_id === b.id && h.purpose_id === p.id && !h.allowed)).filter(p => p.open_to !== 'staff' || b.may.manage).map(p => p.id),
    })),
    purposes: offered.map(p => ({ id: p.id, name: p.name, description: p.description, tier: p.tier, openTo: p.open_to, needsProduction: !!p.needs_production || p.open_to === 'production-team', mayRepeat: !!p.may_repeat })),
    productions,
    slotMinutes: Number(await useSetting('spaces.bookings.slot-size')),
    dayStarts: await useSetting('spaces.calendar.day-starts') as string,
    dayEnds: await useSetting('spaces.calendar.day-ends') as string,
    weekStarts: await useSetting('spaces.calendar.week-starts') as string,
  }
}

/** Productions still to finish whose team this person is on (fact core.production-team). */
async function teamProductions(actor: Actor): Promise<{ id: string, title: string }[]> {
  const live = await all<{ id: string, title: string }>('SELECT id, title FROM core_productions WHERE state IN (\'draft\', \'published\') AND (last_ends_at IS NULL OR last_ends_at > ?) ORDER BY first_starts_at, lower(title)', nowMs())
  const out: { id: string, title: string }[] = []
  for (const p of live) if (await fact('core.production-team', actor, ['core.production', p.id])) out.push(p)
  return out
}
