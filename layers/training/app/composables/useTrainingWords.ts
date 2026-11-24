// The words Training's badges and summaries use (training-records part 5, "Status words"), so every
// screen says a status, a way to learn and a length of time the same way.
import type { MyStatus } from '../../server/learner'
import type { Way } from '../../shared/states'

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const TONE: Record<MyStatus, Tone> = {
  'current': 'success',
  'expiring': 'warning',
  'ends-early': 'warning',
  'lapsed': 'danger',
  'revoked': 'neutral',
  'in-progress': 'info',
  'not-started': 'neutral',
}
const DAY = 86_400 // not-policy: seconds in a day

export function useTrainingWords() {
  const { t } = useT()
  const status = (s: MyStatus, done = 0, of = 0) => ({
    tone: TONE[s],
    label: s === 'in-progress' ? t('training.status.in-progress', { done, of }) : t(`training.status.${s}`),
  })
  const ways = (list: readonly Way[]) => list.map(w => t(`training.ways.${w}`)).join(', ')
  /** A course's length of validity in whole days, months or years, as it was set. */
  const validFor = (course: { expires: boolean, validFor: number | null }) => {
    if (!course.expires || !course.validFor) return t('training.course.no-expiry')
    const days = Math.round(course.validFor / DAY)
    if (days % 365 === 0) return t('training.course.valid-years', { count: days / 365 }) // not-policy: days in a year
    if (days % 30 === 0) return t('training.course.valid-months', { count: days / 30 }) // not-policy: days in a month as settings write them
    return t('training.course.valid-days', { count: days })
  }
  return { status, ways, validFor }
}
