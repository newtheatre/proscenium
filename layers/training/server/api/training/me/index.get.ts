// The signed-in person's training at a glance (M1, M5). Only ever the caller's rows.
import { defineRoute } from '#kit'
import { myTraining } from '../../../learner'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
}, async (_event, { actor }) => myTraining(actor.accountId!))
