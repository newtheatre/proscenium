// A member reference not found while booking, sent for staff to check by hand (Matt, 19 November):
// the source that refused it takes the request, and while it waits the buyer's account meets the type.
import { z } from 'zod'
import { defineRoute, idSchema, refuse, requirements } from '#kit'
import { sellableTypes } from '../../../ticket-types'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ performanceId: idSchema('perf'), ticketTypeId: idSchema('tty'), reference: z.string().trim().min(1).max(64) }).strict(), // not-policy: as a basket's reference
}, async (_event, { input, actor }) => {
  const type = (await sellableTypes()).get(input.ticketTypeId)
  if (!type?.requirementRefs.length) refuse('box-office.requirement.ask-none', 'That kind of ticket needs nothing checked.', { status: 404 })
  const answers = await requirements.check({ accounts: [actor.accountId ?? null], refs: type!.requirementRefs, presented: type!.requirementRefs.map(ref => ({ ref, value: input.reference })), record: ['core.performance', input.performanceId], whenUnavailable: 'not-met' })
  if (answers.some(a => a.verdict === 'met' && !a.unavailable)) return { state: 'met' as const }
  const askable = answers.find(a => a.ask)
  if (!askable) refuse('box-office.requirement.ask-not-taken', answers.find(a => a.reason)?.reason ?? 'That cannot be checked by hand online.', { status: 409, remedy: 'Contact the theatre.' })
  return requirements.ask(askable!.ref, input.reference)
})
