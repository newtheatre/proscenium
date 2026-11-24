// One place on a shift as a calendar file (SU-8, EM-4), for the "Add to calendar" link. Its UID is the
// one the person's calendar feed gives the same place (C-70), so adding both makes one event.
import { first } from '#kit'
import { siteMarker } from '#modules/core'
import { icsFile } from '#modules/calendar-feed'
import { LIVE_STATES } from './db/schema'
import { partFormatters, say } from './words'

const live = LIVE_STATES.map(s => `'${s}'`).join(', ')

interface Row {
  id: string
  state: string
  call_at: number
  ends_at: number
  briefing: string | null
  updated_at: number
  duty: string
  title: string | null
  production_title: string | null
  curtain: number | null
  venue_name: string | null
  space_name: string | null
}

/** One place on a shift as a calendar file, or null when there is no live place by that id. */
export async function calendarOfAssignment(assignmentId: string): Promise<string | null> {
  const row = await first<Row>(`SELECT a.id, a.state, s.call_at, s.ends_at, s.briefing, max(a.updated_at, s.updated_at) AS updated_at, d.name AS duty, s.title, p.title AS production_title, f.starts_at AS curtain, v.name AS venue_name, sp.name AS space_name
    FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id JOIN front_of_house_duties d ON d.id = s.duty_id
    LEFT JOIN core_performances f ON f.id = s.performance_id LEFT JOIN core_productions p ON p.id = f.production_id
    LEFT JOIN core_venues v ON v.id = coalesce(s.venue_id, f.venue_id) LEFT JOIN core_spaces sp ON sp.id = f.space_id
    WHERE a.id = ? AND a.state IN (${live})`, assignmentId)
  if (!row) return null
  const { time } = await partFormatters()
  // This file goes only to the person on the shift, so it carries the curtain time and the briefing.
  const description = [row.curtain !== null ? say('front-of-house.calendar-file.curtain', { time: time(row.curtain) }) : null, row.briefing].filter(Boolean).join('\n')
  return icsFile(say('front-of-house.calendar-file.one'), [{
    uid: `front-of-house.shifts.${row.id}@${await siteMarker()}`,
    startsAt: row.call_at,
    endsAt: row.ends_at,
    title: row.production_title ? `${row.duty}, ${row.production_title}` : row.title ? `${row.duty}: ${row.title}` : row.duty,
    location: [row.venue_name, row.space_name].filter(Boolean).join(', ') || undefined,
    description: description || undefined,
    status: row.state === 'requested' ? 'tentative' : 'confirmed',
    updatedAt: row.updated_at,
  }])
}
