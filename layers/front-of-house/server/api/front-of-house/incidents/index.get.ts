// Incidents for reviewers: numbers, kinds, severities and states, with no free text or people.
import { getQuery } from 'h3'
import { defineRoute } from '#kit'
import { listIncidents } from '../../../incidents'

export default defineRoute({
  ability: 'front-of-house.incident.view',
  rateLimit: 'default',
}, async (event) => {
  const state = getQuery(event).state
  return { incidents: await listIncidents({ state: state === 'reported' || state === 'in_review' || state === 'closed' ? state : undefined }) }
})
