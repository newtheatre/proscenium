// Leave practice (rule S5): the store, its files and its cache keys are gone when this answers.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { endPractice } from '../../../practice/session'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default', input: z.object({}).strict(), practice: 'outside' }, async (_event, { actor }) => {
  await endPractice(actor.accountId!, 'left')
  return { left: true }
})
