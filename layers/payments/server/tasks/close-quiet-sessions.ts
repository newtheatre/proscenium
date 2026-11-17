// Ends till sessions that have been quiet for payments.sessions.close-when-quiet (selling proposal):
// one with no cash closes itself, one with cash stops and awaits its count. One unit per session, so
// one refusal stops one session and not the run.
import { all, createUnit, defineTask, isRefusal, log } from '#kit'
import { closeIfQuiet, type SessionRow } from '../sessions'

const BATCH = 100 // not-policy: sessions looked at per run

export default defineTask(async () => {
  const open = await all<SessionRow>("SELECT * FROM payments_sessions WHERE state = 'open' ORDER BY opened_at LIMIT ?", BATCH)
  for (const session of open) {
    const unit = createUnit()
    try {
      if (await closeIfQuiet(unit.view(), session)) await unit.commit()
    }
    catch (error) {
      if (!isRefusal(error)) log.warn('payments.close-quiet-failed', { sessionId: session.id, error: String((error as Error)?.message ?? error) })
    }
  }
})
