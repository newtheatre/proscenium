// Every holder still carrying a tab balance (F-109 criterion 6). The closing checklist itself,
// and the "cannot close unreviewed" gate, are I-203's; this is the query that screen will read.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.write')
  const [holders, authorised] = await Promise.all([unsettledTabsSummary(), authorisedTabHolders(event)])
  // Counted so an empty register can say nobody may run a tab yet, rather than look broken.
  return { ok: true, holders, authorisedCount: authorised.length }
})
