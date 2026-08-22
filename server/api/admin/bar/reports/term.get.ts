import { manageBar } from '~~/shared/utils/abilities'

/** GET /api/admin/bar/reports/term: what the date pickers should open on. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)
  return currentTerm()
})
