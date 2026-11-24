// What the site-readiness screen still lists, for the Admin overview's card (C-42). Nought for
// anybody who may not open the screen. The theatre's pages are read through the request in hand.
// The content reader is imported when counting, not when the registry is built.
import type { RequestEvent } from 'nuxt/server'
import { can, useContext, type Actor } from '#kit'

export default {
  async value(actor: Actor) {
    if (!(await can(actor, 'public-site.readiness.view')).allowed) return 0
    const { siteReadiness } = await import('../../readiness')
    return (await siteReadiness(useContext().event as RequestEvent)).outstanding
  },
}
