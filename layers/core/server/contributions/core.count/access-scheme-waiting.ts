// Applications and changes waiting for a reviewer, beside the console's "Access scheme" entry (ID-40).
// It counts for a holder of core.access-scheme.read only; for anybody else it is nought.
import { can } from '#kit'
import type { Count } from '../../points/count'
import { reviewQueue, schemeEnabled } from '../../identity/access-scheme'

export default {
  async value(actor) {
    if (!(await schemeEnabled()) || !(await can(actor, 'core.access-scheme.read')).allowed) return 0
    return (await reviewQueue()).length
  },
} satisfies Count
