import { declareAccessProfileForm } from '#shared/utils/access-profiles'

// Declare or change this account's own access profile. Always lands PENDING: a change to a
// verified declaration retires the agreed wording, and this is the one path back from withdrawal.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const input = await readValidatedBodyOrThrow(event, declareAccessProfileForm)

  await declareAccessProfile(event, account.id, input)

  return { ok: true }
})
