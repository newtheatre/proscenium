import { text } from 'drizzle-orm/sqlite-core'
import { col, defineTable } from '#kit/db'

export const notes = defineTable('notify_notes', {
  id: col.id(),
  eventId: col.internal(text('event_id').notNull().unique()),
  performanceId: col.internal(text('performance_id').notNull()),
}, { id: 'nn', realm: 'operational' })

// A table whose rows cannot be dated: no time column, random ids, stored WITHOUT ROWID (R3-23).
export const ballots = defineTable('notify_ballots', {
  id: col.id(),
  choice: col.internal(text('choice').notNull()),
}, { id: 'nbl', realm: 'members', subject: 'none', random: true, timestamps: false, withoutRowid: true })

export const tables = { notes, ballots }
