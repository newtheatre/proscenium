// K4 A session: the facts over its tabs, one primary action by state (publish a draft, otherwise give a
// place) and the rest in a menu. Cancelling names who will be told, as every irreversible act does.
import type { AttendanceView } from './useAttendance'

const TONE = { unpublished: 'neutral', published: 'success', cancelled: 'neutral', completed: 'neutral' } as const

export function useSessionRecord(id: Ref<string>, data: Ref<AttendanceView | undefined>, refresh: () => Promise<void>) {
  const { t } = useT()
  const act = useTrainingAct()
  const toast = useToast()
  const { toRefusal } = useRefusal()
  const base = computed(() => `/api/training/sessions/${encodeURIComponent(id.value)}`)
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
  const editing = ref(false)
  const cancelling = ref(false)
  const adding = ref(false)

  const started = computed(() => !!data.value && Date.now() >= data.value.session.startsAt)
  const open = computed(() => data.value?.session.status === 'unpublished' || data.value?.session.status === 'published')
  const name = computed(() => data.value ? data.value.session.title ?? data.value.session.courseTitle : '')

  async function publish() {
    refusal.value = null
    try {
      await act(`${base.value}/publish`, { method: 'POST', body: {} })
      toast.add({ title: t('training.session-record.published'), color: 'success' })
      await refresh()
    }
    catch (e) {
      refusal.value = toRefusal(e)
    }
  }

  const primary = computed(() => {
    const d = data.value
    if (!d || started.value) return undefined
    if (d.session.status === 'unpublished' && d.actions.manage) return { label: t('training.session-record.publish'), icon: 'i-lucide-send' }
    if (d.session.status === 'published' && d.actions.places) return { label: t('training.session-record.add'), icon: 'i-lucide-user-plus' }
    return undefined
  })
  function onPrimary() {
    if (data.value?.session.status === 'unpublished') void publish()
    else adding.value = true
  }

  const actions = computed(() => {
    const d = data.value
    if (!d?.actions.manage || !open.value) return []
    const change = started.value ? [] : [{ label: t('training.session-record.edit'), icon: 'i-lucide-pencil', onSelect: () => { editing.value = true } }]
    return [change, [{ label: t('training.session-record.cancel'), icon: 'i-lucide-calendar-x', color: 'error' as const, onSelect: () => { cancelling.value = true } }]].filter(g => g.length)
  })

  const recordStatus = computed(() => data.value ? { label: t(`training.session-states.${data.value.session.status}`), tone: TONE[data.value.session.status] } : undefined)
  return { refusal, editing, cancelling, adding, started, name, primary, onPrimary, actions, recordStatus, summary: useSessionSummary(data) }
}

/** The facts above K4's tabs: course, when, where, places taken of capacity, those waiting and who runs it. */
function useSessionSummary(data: Ref<AttendanceView | undefined>) {
  const { t } = useT()
  const { dateTime, time } = useDates()
  return computed(() => {
    const d = data.value
    if (!d) return []
    const s = d.session
    const waiting = (d.places ?? []).filter(p => p.state === 'waiting').length
    const trainers = d.trainers.map(x => x.name ?? t('training.teaching.no-name')).join(', ')
    return [
      { label: t('training.session-record.course'), value: s.courseTitle },
      { label: t('training.session-record.when'), value: t('training.session-record.when-value', { starts: dateTime(s.startsAt), ends: time(s.endsAt) }) },
      { label: t('training.session-record.where'), value: s.spaceName ?? s.placeNote ?? t('training.sessions-list.no-space') },
      { label: t('training.session-record.places'), value: t('training.sessions-list.places', { taken: s.placesTaken, capacity: s.capacity }) },
      { label: t('training.session-record.waiting'), value: String(waiting) },
      { label: t('training.session-record.trainers'), value: trainers || t('training.session-record.no-trainers') },
    ]
  })
}
