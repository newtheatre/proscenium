import { accessConsentForm } from '#shared/utils/access-profiles'

// The owner's switch for whether the door may be shown the agreed wording. Saved on its own and
// never sends the profile back to the officer (D-127 criterion 7).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const input = await readValidatedBodyOrThrow(event, accessConsentForm)

  await setAccessConsent(account.id, input.consent)

  return { ok: true }
})
