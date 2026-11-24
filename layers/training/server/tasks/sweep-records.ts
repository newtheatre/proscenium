// Daily: reads step sources again for people with progress on an activity step, so an occurrence
// whose event was missed still counts (H2). One unit per person and course; safe to run twice.
import { createUnit, defineTask, isRefusal, log } from '#kit'
import { peopleToSweep, readActivity } from '../activity'

export default defineTask(async () => {
  for (const { accountId, courseId } of await peopleToSweep()) {
    try {
      const unit = createUnit()
      await readActivity(unit.view(), accountId, { courseId })
      await unit.commit()
    }
    catch (error) {
      if (!isRefusal(error)) log.warn('training.sweep-failed', { accountId, courseId, error: String((error as Error)?.message ?? error) })
    }
  }
})
