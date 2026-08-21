import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { manageShifts } from '~~/shared/utils/abilities'

/** DELETE /api/shifts/:id — remove a slot from the rota. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageShifts)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Shift ID is required' })

  const [row] = await db.delete(schema.performanceShifts)
    .where(eq(schema.performanceShifts.id, id)).returning({ id: schema.performanceShifts.id })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Shift not found' })

  return { ok: true }
})
