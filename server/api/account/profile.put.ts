import { profileForm } from '#shared/utils/profile'

// Edit this account's own profile.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const input = await readValidatedBodyOrThrow(event, profileForm)

  await saveProfile(account, input)

  // The name is sealed into the session, so the screen would keep showing the old one until the
  // next sign-in. Re-sealed, never re-clocked (A-113 criterion 2).
  await resealSession(event, (await findById(account.id))!)

  return { ok: true }
})
