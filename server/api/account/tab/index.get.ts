// This account's own bar tab, itemised, settled charges and voids included, with the live
// outstanding balance (F-109 criterion 1).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const tab = await itemisedTab(account.id)
  return { ok: true, tab: tab ?? { holderId: account.id, holderName: account.name, outstandingPence: 0, charges: [] } }
})
