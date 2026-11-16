// My emergency contacts and every read of them by staff (ID-17). Members' side only: without a
// standing this is a missing page.
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { contactsOf, readsOf } from '../../../identity/emergency-contacts'
import { isMember } from '../../../identity/standings'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default', input: z.object({}) }, async (_event, { actor }) => {
  if (!(await isMember(actor))) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  const contacts = await contactsOf(actor.accountId!)
  return {
    contacts: contacts.map(({ name, relationship, phone }) => ({ name, relationship, phone })),
    changedAt: contacts.reduce<number | null>((latest, c) => Math.max(latest ?? 0, c.updatedAt), null),
    reads: await readsOf(actor.accountId!),
  }
})
