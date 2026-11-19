// Tickets, as a kind of item a promotion can apply to or require (promotions.target). A promotion
// can be narrowed to a production, one of its performances or parts of the house, and a ticket type.
// A saving on a ticket stands while its seat's claim does: a seat given back gives its use back.
import { all, first, refuse, theatreTimeZone, useSetting } from '#kit'
import { getPerformance, getProduction, listPerformances } from '#modules/core'

type Scope = Record<string, string>
const FIELDS = ['productionId', 'performanceId', 'bandId', 'ticketTypeId'] as const

async function when(startsAt: number): Promise<string> {
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: await theatreTimeZone() }).format(startsAt)
}

const wrong = (field: string, reason: string): never => refuse('box-office.promotion.scope', reason, { status: 422, fields: { [field]: 'Choose another.' } })

export default {
  label: 'box-office.promotions.tickets',
  module: 'box-office',
  order: 10, // not-policy: tickets first

  async fields() {
    const bands = await all<{ id: string, production_id: string, name: string }>('SELECT id, production_id, name FROM box_office_bands ORDER BY sort, name')
    const sold = [...new Set(bands.map(b => b.production_id))]
    const productions = (await Promise.all(sold.map(id => getProduction(id).catch(() => null)))).filter(p => p !== null).sort((a, b) => a.title.localeCompare(b.title))
    const performances = (await Promise.all(productions.map(p => listPerformances({ productionId: p.id })))).flat().filter(p => p.state !== 'cancelled').sort((a, b) => a.startsAt - b.startsAt)
    const types = await all<{ id: string, name: string }>("SELECT id, name FROM box_office_ticket_types WHERE active = 1 AND kind <> 'complimentary' AND (managed_by IS NULL OR managed_by <> 'box-office.pass-entry') ORDER BY sort, name")
    return [
      { id: 'productionId', label: 'box-office.promotions.production', options: productions.map(p => ({ value: p.id, label: p.title })) },
      { id: 'performanceId', label: 'box-office.promotions.performance', parent: 'productionId', needsParent: true, options: await Promise.all(performances.map(async p => ({ value: p.id, label: await when(p.startsAt), parent: p.productionId }))) },
      { id: 'bandId', label: 'box-office.promotions.band', parent: 'productionId', needsParent: true, options: bands.filter(b => productions.some(p => p.id === b.production_id)).map(b => ({ value: b.id, label: b.name, parent: b.production_id })) },
      { id: 'ticketTypeId', label: 'box-office.promotions.ticket-type', options: types.map(t => ({ value: t.id, label: t.name })) },
    ]
  },

  async check(typed: Scope): Promise<Scope> {
    const scope: Scope = {}
    for (const f of FIELDS) if (typed[f]) scope[f] = typed[f]!
    // A part of the house or a performance is its production's, so one names the production too.
    if (scope.bandId) {
      const band = await first<{ production_id: string }>('SELECT production_id FROM box_office_bands WHERE id = ?', scope.bandId)
      if (!band) wrong('bandId', 'There is no such part of the house.')
      if (scope.productionId && band!.production_id !== scope.productionId) wrong('bandId', 'That part of the house is not of that production.')
      scope.productionId = band!.production_id
    }
    if (scope.performanceId) {
      const performance = await getPerformance(scope.performanceId).catch(() => null)
      if (!performance) wrong('performanceId', 'There is no such performance.')
      if (scope.productionId && performance!.productionId !== scope.productionId) wrong('performanceId', 'That performance is not of that production.')
      scope.productionId = performance!.productionId
    }
    if (scope.productionId && !await getProduction(scope.productionId).catch(() => null)) wrong('productionId', 'There is no such production.')
    if (scope.ticketTypeId && !await first("SELECT 1 FROM box_office_ticket_types WHERE id = ? AND kind <> 'complimentary'", scope.ticketTypeId))
      wrong('ticketTypeId', 'There is no such ticket type, or it is not sold.')
    return scope
  },

  async describe(scope: Scope): Promise<string | null> {
    const words = [
      scope.productionId ? (await getProduction(scope.productionId).catch(() => null))?.title : null,
      scope.performanceId ? await getPerformance(scope.performanceId).then(p => when(p.startsAt)).catch(() => null) : null,
      scope.bandId ? (await first<{ name: string }>('SELECT name FROM box_office_bands WHERE id = ?', scope.bandId))?.name : null,
      scope.ticketTypeId ? (await first<{ name: string }>('SELECT name FROM box_office_ticket_types WHERE id = ?', scope.ticketTypeId))?.name : null,
    ].filter(Boolean)
    return words.length ? words.join(', ') : null
  },

  matches(scope: Scope, facts: Record<string, unknown>): boolean {
    return FIELDS.every(f => !scope[f] || scope[f] === facts[f])
  },

  async live(refs: string[]): Promise<Set<string>> {
    const rows = await all<{ id: string }>("SELECT id FROM box_office_claims WHERE state IN ('held', 'confirmed') AND id IN (SELECT value FROM json_each(?))", JSON.stringify(refs))
    return new Set(rows.map(r => r.id))
  },
}
