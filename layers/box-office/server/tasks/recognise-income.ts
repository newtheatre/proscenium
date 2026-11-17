// Moves ticket money from deferred to income for performances that have taken place. One unit per
// performance, so one failure stops one performance and not the run.
import { createUnit, defineTask, isRefusal, log } from '#kit'
import { recognise, unrecognised } from '../recognition'

export default defineTask(async () => {
  for (const due of await unrecognised()) {
    try {
      const unit = createUnit()
      await recognise(unit.view(), due)
      await unit.commit()
    }
    catch (error) {
      if (!isRefusal(error)) log.warn('box-office.recognition-failed', { performanceId: due.performanceId, error: String((error as Error)?.message ?? error) })
    }
  }
})
