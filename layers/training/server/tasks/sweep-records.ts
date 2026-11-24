// Daily at 06:00 (L3, H2): warns people whose training is about to run out, announces lapses, and
// reads step sources again for people with progress on an activity step. It decides nothing, and
// each item is its own unit and told once, so running it twice tells nobody twice.
import { createUnit, defineTask, isRefusal, log, type UnitView } from '#kit'
import { peopleToSweep, readActivity } from '../activity'
import { announceLapse, dueLapses, dueWarnings, warnExpiring } from '../lapsing'

const PAGES = 20 // not-policy: a bound on one run; the next run carries on

async function each<T>(items: T[], work: (unit: UnitView, item: T) => Promise<unknown>, what: string): Promise<number> {
  let done = 0
  for (const item of items) {
    try {
      const unit = createUnit()
      await work(unit.view(), item)
      await unit.commit()
      done++
    }
    catch (error) {
      if (!isRefusal(error)) log.warn('training.sweep-failed', { what, error: String((error as Error)?.message ?? error) })
    }
  }
  return done
}

export default defineTask(async () => {
  for (let page = 0; page < PAGES; page++) {
    const due = await dueWarnings()
    if (!due.length || !await each(due, warnExpiring, 'warning')) break
  }
  for (let page = 0; page < PAGES; page++) {
    const due = await dueLapses()
    if (!due.length || !await each(due, announceLapse, 'lapse')) break
  }
  await each(await peopleToSweep(), (unit, p) => readActivity(unit, p.accountId, { courseId: p.courseId }), 'activity')
})
