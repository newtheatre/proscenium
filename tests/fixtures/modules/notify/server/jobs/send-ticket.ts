// Sends one email from inside a job, as identity's sign-in link does.
import { defineJob } from '#kit'
import { notifyAddress } from '#modules/core'

export default defineJob<{ address: string, link: string, key?: string }>(async (payload, unit) => {
  await notifyAddress(unit, 'notify.ticket-ready', { address: payload.address, variables: { link: payload.link, seat: 'B12' }, dedupeKey: payload.key })
})
