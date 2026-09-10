// What the re-authentication modal may offer this account, at least as strong as this session.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  return { options: await currentReauthOptions(event, account) }
})
