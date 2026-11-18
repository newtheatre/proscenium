// The theatre's duties, in their order, with the requirements a duty may be kept for (FH-5): what
// the switched-on modules offer, such as holding a role or having worked a number of shifts, and the
// labels of those in use.
import { defineRoute, requirements, usePoint } from '#kit'
import { listDuties } from '../../../shifts'

// About booking seats, not working a shift.
const NOT_FOR_DUTIES = new Set(['core.access-scheme'])

export default defineRoute({ ability: 'front-of-house.duty.manage', rateLimit: 'default' }, async () => {
  const duties = await listDuties()
  const sources = (await usePoint('core.requirement')).map(c => c.id).filter(id => !NOT_FOR_DUTIES.has(id))
  const offered = (await Promise.all(sources.map(id => requirements.options(id, '')))).flat()
  const described = await requirements.describe([...new Set(duties.flatMap(d => d.requirements))])
  const labels: Record<string, string> = Object.fromEntries(offered.map(o => [o.reference, o.label]))
  for (const [ref, d] of Object.entries(described)) labels[ref] = d.label
  return { duties, requirementOptions: offered.map(o => ({ value: o.reference, label: o.label })), requirementLabels: labels }
})
