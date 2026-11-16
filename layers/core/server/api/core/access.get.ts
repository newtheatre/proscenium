// May this viewer open this address? Asked by every page under a shell's prefix before it renders.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { decideAccess } from '../../interface/access'

export default defineRoute({
  public: true,
  rateLimit: 'default',
  input: z.object({ path: z.string().startsWith('/').max(500) }), // not-policy: a sane address length
}, async (_event, { input, actor }) => decideAccess(actor, input.path))
