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

  const placesPath = (session: Session) => `/api/training/sessions/${encodeURIComponent(session.id)}/places`

  /** Cancel or leave the waiting list, while the place still allows it. */
  function cancelAction({ mine, times }: SessionView) {
    if (!mine) return null
    const waiting = mine.state === 'waiting'
    if (!waiting && !(mine.state === 'booked' && now.value < times.cancelUntil)) return null
    return { label: t(waiting ? 'training.session.leave-waiting' : 'training.session.cancel'), icon: 'i-lucide-calendar-x', quiet: true, run: () => run(`/api/training/places/${encodeURIComponent(mine.id)}/cancel`, t('training.session.cancelled')) }
  }

  /** Sign up, or join the waiting list when full, while sign-up is open. */
  function bookAction({ session, mine, times, actions }: SessionView) {
    if (mine || !actions.book || session.signUp !== 'open' || now.value >= times.signUpClosesAt) return null
    if (session.placesTaken < session.capacity)
      return { label: t('training.session.sign-up'), icon: 'i-lucide-calendar-plus', run: () => run(placesPath(session), t('training.session.signed-up')) }
    if (times.waitingList)
      return { label: t('training.session.join-waiting'), icon: 'i-lucide-list-plus', run: () => run(placesPath(session), t('training.session.joined-waiting')) }
    return null
  }

  const action = computed(() => {
    const d = data.value
    if (!d || d.session.status !== 'published') return null
    return cancelAction(d) ?? bookAction(d)
  })

  /** Why someone with a place cannot cancel any more. */
  function tooLateNote(d: SessionView) {
    const { session, mine, times } = d
    if (mine?.state !== 'booked' || now.value < times.cancelUntil || now.value >= session.startsAt) return null
    const trainer = d.trainers.find(x => x.name)?.name
    return trainer ? t('training.session.too-late-named', { trainer }) : t('training.session.too-late')
  }

  /** Why someone without a place cannot take one. */
  function noPlaceNote({ session, times }: SessionView) {
    if (session.signUp !== 'open') return t('training.session.invited')
    if (now.value >= times.signUpClosesAt) return t('training.session.closed')
    if (session.placesTaken < session.capacity || times.waitingList) return null
    return times.next ? t('training.session.full-next', { when: dayNamed(times.next.startsAt) }) : t('training.session.full-none')
  }

  /** Why there is no action, when the person would expect one. */
  const note = computed(() => {
    const d = data.value
    if (!d) return null
    if (d.session.status === 'cancelled') return t('training.session.is-cancelled', { reason: d.session.cancelReason ?? '' })
    if (d.session.status !== 'published') return null
    return d.mine ? tooLateNote(d) : noPlaceNote(d)
  })

  return { action, note, refusal }
}
