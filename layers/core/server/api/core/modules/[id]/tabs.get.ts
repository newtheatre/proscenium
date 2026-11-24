// The tabs of one module's page in Admin that this viewer may open: its pages of settings, its
// set-up screens and About. The console's settings window asks for the same tabs and draws those
// that are pages of settings, so console staff change their module's settings without Admin.
import { getRouterParam } from 'nuxt/server'
import { defineRoute, refuse } from '#kit'
import { useRegistry } from '#kit/registry'
import { moduleTabs } from '../../../../interface/navigation'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const id = getRouterParam(event, 'id', { decode: true }) ?? ''
  if (!useRegistry().modules.has(id)) return refuse('core.not-found', 'There is nothing here.', { status: 404 })
  return { module: id, tabs: await moduleTabs(actor, id) }
})
