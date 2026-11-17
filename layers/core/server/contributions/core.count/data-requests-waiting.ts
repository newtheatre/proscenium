// Data requests that need staff, beside the console's "Data requests" entry (ID-35): finished but
// not yet closed, or still open past their respond-by date. Nought for anybody without the ability.
import { can, first, nowMs } from '#kit'
import type { Count } from '../../points/count'

export default {
  async value(actor) {
    if (!(await can(actor, 'core.data-request.manage')).allowed) return 0
    const row = await first<{ n: number }>(
      'SELECT count(*) AS n FROM core_data_requests WHERE closed_at IS NULL AND (state IN (\'done\', \'cancelled\', \'failed\') OR respond_by < ?)',
      nowMs(),
    )
    return row?.n ?? 0
  },
} satisfies Count
