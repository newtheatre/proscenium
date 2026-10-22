import { emailChangeForm } from '#shared/utils/email-change'

// Ask to change the address this account signs in with; nothing moves until the new one confirms.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  await requireFreshSession(event)

  const input = await readValidatedBodyOrThrow(event, emailChangeForm)
  await requestEmailChange(event, account, input.email, account.id)

  // One answer whether or not the address was taken (A-115 criterion 2).
  return { ok: true, message: 'Check the new address for a link to confirm it' }
})
