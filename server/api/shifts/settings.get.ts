import { listShifts } from '~~/shared/utils/abilities'

/** GET /api/shifts/settings — how claims behave this season. */
export default defineEventHandler(async (event) => {
  await authorize(event, listShifts)
  return rotaSettings()
})
