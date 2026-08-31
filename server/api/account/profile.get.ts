// This account's own profile, and who can see each part of it.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  return { profile: await profileFor(account) }
})
