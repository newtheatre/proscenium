// Purposes in tier order (SP-08), with the theatre's limits a purpose falls back to and the
// starting lists offered while there are none (SP-07).
import { defineRoute, useSetting } from '#kit'
import { listPurposes } from '../../../setup'
import { STARTING_LISTS, startingPurposes } from '../../../../shared/setup'

const MINUTE = 60 // not-policy: settings are whole seconds
const DAY = 86_400 // not-policy: settings are whole seconds

export default defineRoute({ ability: 'spaces.purpose.manage', rateLimit: 'default' }, async () => {
  const purposes = await listPurposes()
  const starting = purposes.length ? [] : STARTING_LISTS.map(list => ({ list, purposes: startingPurposes(list).map(p => ({ name: p.name, tier: p.tier, approval: p.approval })) }))
  const fallbacks = {
    maxLengthMinutes: Math.round(await useSetting('spaces.bookings.max-length') as number / MINUTE),
    maxAheadDays: Math.round(await useSetting('spaces.bookings.max-ahead') as number / DAY),
    minNoticeMinutes: Math.round(await useSetting('spaces.bookings.min-notice') as number / MINUTE),
  }
  return { purposes, starting, fallbacks }
})
