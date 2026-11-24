// M4's one action (training-records part 5): sign up, join the waiting list or cancel my place, by
// the person's place and the session's times; otherwise the sentence that says why not.
import type { Place, Session } from '../../server/sessions'
import type { SessionTimes } from '../../server/learner'

export interface SessionView {
  session: Session
  courseSlug: string | null
  trainers: { accountId: string, name: string | null }[]
  mine: Place | null
  times: SessionTimes
  actions: { book: boolean }
}

export function useSessionPlace(data: Ref<SessionView | undefined>, refresh: () => Promise<void>) {
  const { t } = useT()
  const { dayNamed } = useDates()
  const act = useTrainingAct()
  const { toRefusal } = useRefusal()
  const toast = useToast()
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
  const now = ref(Date.now())

  async function run(path: string, done: string) {
    refusal.value = null
    try {
      await act(path, { method: 'POST', body: {} })
      toast.add({ title: done, color: 'success' })
      await refresh()
    }
    catch (e) {
      refusal.value = toRefusal(e)
    }
    now.value = Date.now()
  }

  const action = computed(() => {
    const d = data.value
    if (!d || d.session.status !== 'published') return null
    const { session, mine, times } = d
    if (mine && (mine.state === 'waiting' || (mine.state === 'booked' && now.value < times.cancelUntil)))
      return { label: t(mine.state === 'waiting' ? 'training.session.leave-waiting' : 'training.session.cancel'), icon: 'i-lucide-calendar-x', quiet: true, run: () => run(`/api/training/places/${encodeURIComponent(mine.id)}/cancel`, t('training.session.cancelled')) }
    if (mine || !d.actions.book || session.signUp !== 'open' || now.value >= times.signUpClosesAt) return null
    if (session.placesTaken < session.capacity)
      return { label: t('training.session.sign-up'), icon: 'i-lucide-calendar-plus', run: () => run(`/api/training/sessions/${encodeURIComponent(session.id)}/places`, t('training.session.signed-up')) }
    if (times.waitingList)
      return { label: t('training.session.join-waiting'), icon: 'i-lucide-list-plus', run: () => run(`/api/training/sessions/${encodeURIComponent(session.id)}/places`, t('training.session.joined-waiting')) }
    return null
  })

  /** Why there is no action, when the person would expect one. */
  const note = computed(() => {
    const d = data.value
    if (!d) return null
    const { session, mine, times } = d
    if (session.status === 'cancelled') return t('training.session.is-cancelled', { reason: session.cancelReason ?? '' })
    if (session.status !== 'published') return null
    const trainer = d.trainers.find(x => x.name)?.name
    if (mine?.state === 'booked' && now.value >= times.cancelUntil && now.value < session.startsAt)
      return trainer ? t('training.session.too-late-named', { trainer }) : t('training.session.too-late')
    if (mine) return null
    if (session.signUp !== 'open') return t('training.session.invited')
    if (now.value >= times.signUpClosesAt) return t('training.session.closed')
    if (session.placesTaken >= session.capacity && !times.waitingList)
      return times.next ? t('training.session.full-next', { when: dayNamed(times.next.startsAt) }) : t('training.session.full-none')
    return null
  })

  return { action, note, refusal }
}
