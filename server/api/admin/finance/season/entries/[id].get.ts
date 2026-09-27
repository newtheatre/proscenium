import { ledgerEntryDetail } from '#server/utils/season-dashboard'

// One ledger entry, opened from the list: who took it, who approved it, whose tab it was and each
// line with its show and booking (issue 1361, I-101). Treasurer and administrators only.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'finance.read')
  const id = getRouterParam(event, 'id') ?? ''

  const entry = await ledgerEntryDetail(id)
  if (!entry) throw noSuch('ledger entry')

  return entry
})
