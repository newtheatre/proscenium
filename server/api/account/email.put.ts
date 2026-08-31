import { emailChangeForm } from '#shared/utils/email-change'

// Change the address this account signs in with.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  await requireFreshSession(event)

  const input = await readValidatedBodyOrThrow(event, emailChangeForm)
  await changeEmail(event, account, input.email, account.id)

  // The change ended this session too, so it is re-sealed against the new epoch and the new
  // address. One answer whether or not the address was taken (A-115 criterion 2).
  await resealSession(event, (await findById(account.id))!)

  return { ok: true, message: 'Check the new address for a link to confirm it' }
})
