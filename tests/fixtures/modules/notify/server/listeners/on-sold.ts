import { sql } from 'drizzle-orm'
import { defineListener, newId } from '#kit'

export default defineListener((event, unit) => {
  unit.add(sql`INSERT INTO notify_notes (id, event_id, performance_id) VALUES (${newId('nn')}, ${event.id}, ${String(event.payload.performanceId)})`)
})
