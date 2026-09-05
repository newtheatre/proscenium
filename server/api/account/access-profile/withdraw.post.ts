// Withdraw this account's own access profile. Tombstoned for 30 days, then deleted outright by
// the nightly sweep; only the owner declaring again brings it back (D-127 criterion 5).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  return await withdrawAccessProfile(account.id)
})
