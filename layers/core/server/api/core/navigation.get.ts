// The menu of one shell for the viewer: a flat list, or the console's groups.
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { navigationFor } from '../../interface/navigation'
import { isEntitled } from '../../interface/viewer'

export default defineRoute({
  public: true,
  rateLimit: 'default',
  input: z.object({ shell: z.enum(['account', 'members', 'console', 'admin', 'live']) }),
}, async (_event, { input, actor }) => {
  // A shell the viewer has no business in answers exactly as a missing page.
  if (!(await isEntitled(actor, input.shell))) return refuse('core.not-found', 'There is nothing here.', { status: 404 })
  return navigationFor(actor, input.shell)
})
