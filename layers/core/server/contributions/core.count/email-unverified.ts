// One while no sending domain is verified, when nothing at all is emailed (sign-in links included),
// for Admin's overview warning. Nought for anybody who cannot set up sending.
import { can } from '#kit'
import type { Count } from '../../points/count'
import { emailVerified } from '../../settings/getting-ready'

export default {
  async value(actor) {
    if (!(await can(actor, 'core.sender.manage')).allowed) return 0
    return await emailVerified() ? 0 : 1
  },
} satisfies Count
