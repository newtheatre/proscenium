// M1's cards, most urgent first (training-records part 5): training that has lapsed, then training
// running out, then places the person holds, courses part-way through and evidence turned down.
import type { MyTraining } from '../../server/learner'

export interface Nudge {
  id: string
  tone: 'error' | 'warning' | 'info' | 'neutral'
  icon: string
  title: string
  description?: string
  action: { label: string, to: string }
}

const DAY_MS = 86_400_000 // not-policy: milliseconds in a day

export function useTrainingNudges(data: Ref<MyTraining | undefined>) {
  const { t } = useT()
  const { day, dayNamed, dateTime, time } = useDates()
  const course = (slug: string) => `/members/training/courses/${encodeURIComponent(slug)}`
  const session = (id: string) => `/members/training/sessions/${encodeURIComponent(id)}`

  const renewal = (r: MyTraining['records'][number]): Pick<Nudge, 'description' | 'action'> => r.nextSession
    ? {
        description: t(r.nextSession.placesLeft ? 'training.home.next-session' : 'training.home.next-session-full', { when: dayNamed(r.nextSession.startsAt), time: time(r.nextSession.startsAt), count: r.nextSession.placesLeft }),
        action: { label: t('training.home.sign-up'), to: session(r.nextSession.id) },
      }
    : { action: { label: t('training.home.see-course'), to: course(r.slug) } }

  return computed<Nudge[]>(() => {
    const d = data.value
    if (!d) return []
    const now = Date.now()
    const lapsed = d.records.filter(r => r.myStatus === 'lapsed').map(r => ({
      id: `lapsed:${r.id}`, tone: 'error' as const, icon: 'i-lucide-octagon-alert',
      title: t('training.home.lapsed', { course: r.courseTitle, date: day(r.expiresAt!) }), ...renewal(r),
    }))
    const ending = d.records.filter(r => (r.myStatus === 'expiring' || r.myStatus === 'ends-early') && r.expiresAt).map(r => ({
      id: `expiring:${r.id}`, tone: 'warning' as const, icon: 'i-lucide-triangle-alert',
      title: t(r.myStatus === 'ends-early' ? 'training.home.ends-early' : 'training.home.expiring', { course: r.courseTitle, date: day(r.expiresAt!), count: Math.max(1, Math.ceil((r.expiresAt! - now) / DAY_MS)) }),
      ...renewal(r),
    }))
    const places = d.places.map(p => ({
      id: `place:${p.id}`, tone: 'info' as const, icon: 'i-lucide-calendar-check',
      title: t(p.state === 'waiting' ? 'training.home.waiting' : 'training.home.place', { session: p.session.title ?? p.session.courseTitle, when: dateTime(p.session.startsAt) }),
      description: p.session.spaceName ?? p.session.placeNote ?? undefined,
      action: { label: t('training.home.view'), to: session(p.sessionId) },
    }))
    const going = d.inProgress.map(c => ({
      id: `progress:${c.courseId}`, tone: 'neutral' as const, icon: 'i-lucide-circle-dot',
      title: t('training.home.carry-on', { course: c.title, done: c.done, of: c.of }),
      action: { label: t('training.home.carry-on-action'), to: course(c.slug) },
    }))
    const refused = d.notApproved.map(e => ({
      id: `refused:${e.evidenceId}`, tone: 'warning' as const, icon: 'i-lucide-file-x',
      title: t('training.home.not-approved', { course: e.title }),
      description: e.reason ?? undefined,
      action: { label: t('training.home.see-why'), to: course(e.slug) },
    }))
    return [...lapsed, ...ending, ...refused, ...places, ...going]
  })
}
