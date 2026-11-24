// M6: the pretend "confirm it's you" in practice. It accepts a press and records it in the store
// only; the real sign-in session is untouched.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { pretendReassert } from '../../../practice/service'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default', input: z.object({}).strict() }, async () => pretendReassert())
