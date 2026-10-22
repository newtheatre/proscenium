import { currentShowNight } from '#shared/utils/show-night'

// Tonight's code for this account's own tab, shown on My NNT so the bar can charge it while the
// holder is there (F-108 criterion 6, 0164). Only an authorised holder has one.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const holder = await authorisedTabHolder(event, account.id)
  if (!holder) throw createError({ statusCode: 403, statusMessage: 'You are not authorised to run a tab, so there is no code to show' })
  const night = currentShowNight()
  return { ok: true, night, code: await tabPresenceCode(account.id, night) }
})
