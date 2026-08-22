import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  debtorUserId: z.string().trim().min(1),
  expectedTotalPence: z.coerce.number().int().min(1),
})

/** POST /api/admin/bar/tabs/settle, clearing a tab away from the till. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const { user } = await requireUserSession(event)
  const input = await readValidatedBody(event, bodySchema.parse)

  return await settleTab({
    debtorUserId: input.debtorUserId,
    takenByUserId: user.id,
    source: 'BOX_OFFICE_DESK',
    expectedTotalPence: input.expectedTotalPence,
  })
})
