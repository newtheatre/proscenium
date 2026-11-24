// PM-S7: the trainee's answer on the practice card reader, settled as the real reader's would be.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { answerCardReader } from '../../../../practice/service'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ outcome: z.enum(['approved', 'declined', 'removed', 'no-answer']) }).strict(),
}, async (event, { input }) => answerCardReader(event.context.params!.id!, input.outcome))
