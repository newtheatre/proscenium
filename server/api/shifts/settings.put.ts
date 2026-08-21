import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { manageShifts } from '~~/shared/utils/abilities'

const bodySchema = z.object({ autoConfirmClaims: z.boolean() })

/** PUT /api/shifts/settings — a per-season toggle, because trust differs. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageShifts)

  const { autoConfirmClaims } = await readValidatedBody(event, bodySchema.parse)
  await rotaSettings()

  const [row] = await db.update(schema.rotaSettings)
    .set({ autoConfirmClaims })
    .where(eq(schema.rotaSettings.id, 'current'))
    .returning()

  return row
})
