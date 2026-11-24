// Adds a note to tonight's report by topic, or an addendum once it is signed off (FH-31, FH-33).
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { NOTE_TOPICS } from '../../../../../db/schema'
import { addNote } from '../../../../../reports'

export default defineRoute({
  ability: 'front-of-house.night-report.write',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ topic: z.enum(NOTE_TOPICS), body: z.string().trim().min(1).max(2000) }).strict(), // not-policy: shape bound, as the table's CHECK
}, async (_event, { input, record, actor, unit }) => ({ noteId: await addNote(unit.view(), { performanceId: record!.id!, ...input, by: actor.accountId! }) }))
