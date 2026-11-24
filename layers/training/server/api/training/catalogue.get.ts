// The courses a member can take (M2): live courses only, each with its ways to learn and the reader's own standing.
import { defineRoute } from '#kit'
import { catalogue } from '../../learner'

export default defineRoute({
  ability: 'training.course.view',
  rateLimit: 'default',
}, async (_event, { actor }) => ({ courses: await catalogue(actor.accountId) }))
