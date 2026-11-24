// The competencies the signed-in person holds now, each with until when and the route held by.
import { defineRoute } from '#kit'
import { competenciesOf } from '../../../verdicts'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
}, async (_event, { actor }) => ({ competencies: await competenciesOf(actor.accountId!) }))
