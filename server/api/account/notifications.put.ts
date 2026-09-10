import { preferenceForm } from '#shared/utils/notifications'

// Set one topic's preference for this account. Takes effect on the next send: the centre reads
// preferences when it sends, never when a message was asked for (H-102 criterion 4).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const input = await readValidatedBodyOrThrow(event, preferenceForm)

  await savePreference(account.id, input)

  return { ok: true }
})
