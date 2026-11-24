// Under-18 warnings (F6, A9, AV-14): from core's ageStatuses only, for the organiser, never blocking.
import { useSetting } from '#kit'
import { ageStatuses } from '#modules/core'
import { minutesOf } from '../shared/levels'
import type { Under18 } from '../shared/find'

/** Who among `ids` is under 18 on each of `dates` (in order), and whether they are one adult and one under-18. */
export async function under18(ids: string[], dates: string[]): Promise<Under18> {
  const latest = await useSetting('core.under-18.latest-finish') as string | null
  const first = await ageStatuses(ids, dates[0])
  let young = ids.filter(id => first.get(id) === 'under-18')
  const oneToOne = ids.length === 2 && young.length === 1 && await useSetting('availability.safeguarding.one-to-one') === true // not-policy: one adult and one under-18
  const late: Record<string, string[]> = {}
  // Once someone turns 18 they stay so, so each later date need only ask the ones still under 18.
  for (const date of latest ? dates : []) {
    if (!young.length) break
    const on = await ageStatuses(young, date)
    young = young.filter(id => on.get(id) === 'under-18')
    if (young.length) late[date] = young
  }
  return { lateFinish: latest ? minutesOf(latest) : null, late, oneToOne }
}
