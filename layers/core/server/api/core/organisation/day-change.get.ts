// How many stored operating days a new time zone or day start would change, asked before saving it
// (C-37: "says how many first").
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { dayRule, rowsToRecompute } from '../../../calendar'

export default defineRoute({
  ability: 'core.organisation.edit',
  rateLimit: 'default',
  input: z.object({
    timeZone: z.string().max(64).optional(), // not-policy: the length of the longest zone name, with room
    dayStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), // not-policy: the shape of HH:MM
  }),
}, async (_event, { input }) => {
  const current = await dayRule()
  const timeZone = input.timeZone ?? current?.timeZone
  if (!timeZone) return { changes: 0 }
  const rule = { timeZone, rollover: input.dayStart ?? current?.rollover ?? '04:00' }
  try { new Intl.DateTimeFormat('en-GB', { timeZone: rule.timeZone }) }
  catch { refuse('core.organisation.unknown-time-zone', `${rule.timeZone} is not a time zone.`, { status: 422, fields: { timeZone: 'unknown' } }) }
  const rows = await rowsToRecompute(rule)
  return { changes: rows.length }
})
