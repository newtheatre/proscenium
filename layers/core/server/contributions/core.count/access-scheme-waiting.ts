// Applications and changes waiting for a reviewer, beside the console's "Access scheme" entry (ID-40).
// It counts for a holder of core.access-scheme.read only; for anybody else it is nought. The number
// is only a count, naming nobody, so a reviewer signed in without a passkey still sees it: opening
// the queue is what asks for the stronger sign-in.
import { can } from '#kit'
import type { Count } from '../../points/count'
import { reviewQueue, schemeEnabled } from '../../identity/access-scheme'

export default {
  async value(actor) {
    if (!(await schemeEnabled()) || !(await can({ ...actor, assurance: 'strong' }, 'core.access-scheme.read')).allowed) return 0
    return (await reviewQueue()).length
  },
} satisfies Count
