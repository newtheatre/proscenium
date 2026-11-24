// A person's progress on a course's practical steps, for the trainer signing them off (M9, TR-05).
import { getQuery } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { practicalProgress } from '../../../teaching'

export default defineRoute({
  ability: 'training.sign-off.record',
  record: event => ['training.course', String(getQuery(event).courseId ?? '')],
  rateLimit: 'default',
  input: z.object({ courseId: z.string().min(1), accountId: z.string().min(1) }),
}, async (_event, { input }) => practicalProgress(input.courseId, input.accountId))
