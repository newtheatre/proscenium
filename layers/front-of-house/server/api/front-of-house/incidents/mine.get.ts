// The reporter's own reports: number, kind, state and their own words (FH-27).
import { defineRoute } from '#kit'
import { myReports } from '../../../incidents'

export default defineRoute({
  ability: 'front-of-house.incident.report',
  rateLimit: 'default',
}, async (_event, { actor }) => ({ incidents: await myReports(actor.accountId!) }))
