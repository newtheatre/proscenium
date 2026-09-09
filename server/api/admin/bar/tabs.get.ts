// Every holder still carrying a tab balance (F-109 criterion 6). The closing checklist itself,
// and the "cannot close unreviewed" gate, are I-203's; this is the query that screen will read.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.write')
  return { ok: true, holders: await unsettledTabsSummary() }
})
