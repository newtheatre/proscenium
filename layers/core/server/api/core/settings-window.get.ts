// The console's settings window: the tabs of modules' pages in Admin that the cog on one console
// page shows (?for=<entry id>), or every tab of one module (?for=<module>), as far as the viewer may
// open them, and what the window is called.
import { getQuery } from 'h3'
import { defineRoute, refuse } from '#kit'
import { settingsWindow } from '../../interface/navigation'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const scope = getQuery(event).for
  const window = typeof scope === 'string' ? await settingsWindow(actor, scope) : undefined
  if (!window) return refuse('core.not-found', 'There is nothing here.', { status: 404 })
  return window
})
