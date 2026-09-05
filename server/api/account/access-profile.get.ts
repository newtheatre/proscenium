// This account's own access profile: every flag and note, decrypted for the person who owns it.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  return { profile: await ownAccessProfile(account.id) }
})
