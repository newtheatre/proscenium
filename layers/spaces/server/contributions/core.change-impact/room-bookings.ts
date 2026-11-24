// Room bookings' lines on core's confirmation of a change (SP-34, rules L1 and C6): how many bookings
// a rescheduled or moved performance would move aside, and how many a space no longer run would
// leave to be placed with its owner. It warns; it never refuses.
import { sql } from 'drizzle-orm'
import { first, wordsFrom } from '#kit'
import type { ChangeImpact } from '#modules/core'
import { displacedCount } from '../../displace'
import catalogue from '../../../i18n/en-GB.json'

const say = wordsFrom(catalogue)

export default {
  async impact(change) {
    if (change.record.type === 'core.space' && change.kind === 'space.managed') {
      if (change.to?.managed !== false) return []
      const { bookings } = await displacedCount(sql`b.bookable_id IN (SELECT id FROM spaces_bookables WHERE kind = 'space' AND space_id = ${change.record.id})`)
      return bookings ? [say('spaces.impact.external', { count: bookings })] : []
    }
    if (change.record.type !== 'core.performance' || (change.kind !== 'reschedule' && change.kind !== 'move')) return []
    const now = await first<{ space_id: string, starts_at: number, ends_at: number }>('SELECT space_id, starts_at, ends_at FROM core_performances WHERE id = ?', change.record.id)
    if (!now) return []
    const spaceId = change.to?.spaceId ?? now.space_id
    const from = change.to?.startsAt ?? now.starts_at
    const to = change.to?.endsAt ?? now.ends_at
    const counted = await displacedCount(sql`b.bookable_id IN (SELECT id FROM spaces_bookables WHERE kind = 'space' AND space_id = ${spaceId}) AND b.starts_at < ${to} AND b.ends_at > ${from}`)
    return [
      ...(counted.bookings ? [say('spaces.impact.bookings', { count: counted.bookings })] : []),
      ...(counted.requests ? [say('spaces.impact.requests', { count: counted.requests })] : []),
    ]
  },
} satisfies ChangeImpact
