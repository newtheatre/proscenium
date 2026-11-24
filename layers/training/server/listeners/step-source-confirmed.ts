// A step source announced a confirmed occurrence (H2): the person's activity steps on that source are
// read again. Each source's event is listed in module.ts under events.listens, naming this file.
import { defineListener } from '#kit'
import { activityAnnounced } from '../activity'

export default defineListener(async (event, unit) => {
  const { accountId } = event.payload as { accountId?: string }
  if (accountId) await activityAnnounced(unit, event.name, accountId)
})
