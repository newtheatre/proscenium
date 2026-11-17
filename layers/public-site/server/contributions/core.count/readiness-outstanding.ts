// What the site-readiness screen still lists, for the Admin overview's card (C-42). Nought for
// anybody who may not open the screen. The theatre's pages are read through the request in hand.
// Nitro and the content reader are imported when counting, not when the registry is built.
import { can, type Actor } from '#kit'

export default {
  async value(actor: Actor) {
    if (!(await can(actor, 'public-site.readiness.view')).allowed) return 0
    const [{ useEvent }, { siteReadiness }] = await Promise.all([import('nitropack/runtime'), import('../../readiness')])
    return (await siteReadiness(useEvent())).outstanding
  },
}
