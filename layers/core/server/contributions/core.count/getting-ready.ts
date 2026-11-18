// How many of "Get your theatre ready"'s steps are still to do, for Admin's overview card. Nought for
// anybody who cannot change the site's settings, and nought once every step is done.
import { can } from '#kit'
import type { Count } from '../../points/count'
import { gettingReady } from '../../settings/getting-ready'

export default {
  async value(actor) {
    if (!(await can(actor, 'core.settings.manage')).allowed) return 0
    return (await gettingReady()).filter(item => !item.done).length
  },
} satisfies Count
