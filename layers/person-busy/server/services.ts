// The person-busy service (C-66). A module that requires person-busy imports it as #modules/person-busy.
// Advisory: it warns a planner and decides no write. Rows carry source, so a caller can leave out its own.
import { isEnabled, log, refuse, usePoint } from '#kit'
import type { PersonBusy, PersonBusyItem } from '#modules/core'

export type { PersonBusyItem } from '#modules/core'

/** A busy time with the id of the module that reported it. */
export interface BusyRow extends PersonBusyItem {
  source: string
}

/** Ids bound per contributor call: D1 binds at most 100 parameters (0006). */
export const PERSON_BUSY_CHUNK = 90 // not-policy: D1's parameter limit, with room
/** The longest window one read may ask about. */
export const PERSON_BUSY_MAX_DAYS = 400 // not-policy: a committee year and a little, bounding one read
const DAY_MS = 86_400_000 // not-policy: a day in milliseconds

/** One person's commitments overlapping [from, to), from every switched-on contributor. */
export async function personBusy(accountId: string, from: number, to: number): Promise<BusyRow[]> {
  return personsBusy([accountId], from, to)
}

/**
 * Commitments overlapping [from, to) for each asked account, sorted by person then time. A row about
 * anyone not asked, or outside the window, is dropped and logged; a contributor that fails is left out.
 */
export async function personsBusy(accountIds: string[], from: number, to: number): Promise<BusyRow[]> {
  if (!(await isEnabled('person-busy'))) refuse('core.module.off', 'person-busy is off: no module that needs it is switched on.', { status: 404 })
  if (!(to > from)) refuse('person-busy.window', 'The window must end after it starts.', { status: 422, fields: { to: 'The window must end after it starts.' } })
  if (to - from > PERSON_BUSY_MAX_DAYS * DAY_MS) refuse('person-busy.too-long', `Ask for at most ${PERSON_BUSY_MAX_DAYS} days at a time.`, { status: 422, fields: { to: `At most ${PERSON_BUSY_MAX_DAYS} days.` } })
  const asked = [...new Set(accountIds)]
  if (!asked.length) return []
  const wanted = new Set(asked)
  const chunks: string[][] = []
  for (let i = 0; i < asked.length; i += PERSON_BUSY_CHUNK) chunks.push(asked.slice(i, i + PERSON_BUSY_CHUNK))

  const out: BusyRow[] = []
  for (const { module, value } of await usePoint<PersonBusy>('core.person-busy')) {
    for (const ids of chunks) {
      let rows: PersonBusyItem[]
      try {
        rows = await value.busy({ accountIds: ids, from, to })
      }
      catch (error) {
        log.warn('person-busy.contributor-failed', { module, error: (error as Error)?.name })
        break
      }
      const chunk = new Set(ids)
      for (const row of rows) {
        if (!chunk.has(row.accountId) || !wanted.has(row.accountId)) {
          log.error('person-busy.stranger', { module })
          continue
        }
        if (!(row.to > row.from) || row.from >= to || row.to <= from) continue
        out.push({ accountId: row.accountId, kind: row.kind, from: row.from, to: row.to, firm: !!row.firm, labelKey: row.labelKey, record: row.record ?? null, source: module })
      }
    }
  }
  return out.sort((a, b) => a.accountId.localeCompare(b.accountId) || a.from - b.from || a.source.localeCompare(b.source))
}
