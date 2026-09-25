import { declareAccessProfileForm } from '#shared/utils/access-profiles'

// Declare or change this account's own access profile. A real change lands PENDING and retires the
// agreed wording; an unchanged save keeps a current profile as it is (D-127 criterion 7).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const input = await readValidatedBodyOrThrow(event, declareAccessProfileForm)

  const outcome = await declareAccessProfile(event, account.id, input)

  return { ok: true, repended: outcome.repended }
})
