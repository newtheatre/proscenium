import { db } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { z } from 'zod'
import { manageShifts } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).optional().default({})

/**
 * POST /api/shifts/stamp: stamp the template onto performances that have no
 * shifts. Idempotent: a performance with any shift is left alone.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, manageShifts)

  const input = await readValidatedBody(event, body => bodySchema.parse(body ?? {}))
  const from = input.from ? validityStart(input.from) : new Date()
  const to = input.to ? validityEnd(input.to) : new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)

  const { statements, performances, slots, withoutTemplate } = await stampMissingShifts(from, to)
  if (statements.length) {
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  }

  return { performances, slots, withoutTemplate }
})
