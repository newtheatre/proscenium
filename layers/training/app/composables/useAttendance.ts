// M8 Mark attendance (TR-12, TR-13): one tap marks a place here or not here, a marked place can be
// changed until attendance closes, and closing needs every place marked.
import type { Place } from '../../server/sessions'
import type { SessionView } from './useSessionPlace'

export interface AttendanceView extends Omit<SessionView, 'actions'> {
  places: Place[] | null
  actions: SessionView['actions'] & { run: boolean, manage: boolean, places: boolean }
}

/** `afterClose` runs once attendance is closed: by default back to Teaching, as M8 is reached from there. */
export function useAttendance(id: Ref<string>, data: Ref<AttendanceView | undefined>, refresh: () => Promise<void>, afterClose: () => unknown = () => navigateTo('/members/training/teaching')) {
  const { t } = useT()
  const act = useTrainingAct()
  const toast = useToast()
  const { toRefusal } = useRefusal()
  const base = computed(() => `/api/training/sessions/${encodeURIComponent(id.value)}`)

  const places = computed(() => (data.value?.places ?? []).filter(p => p.state !== 'waiting'))
  const marked = computed(() => places.value.filter(p => p.state === 'attended' || p.state === 'absent').length)
  const left = computed(() => places.value.length - marked.value)
  const started = computed(() => !!data.value && Date.now() >= data.value.session.startsAt)
  const closed = computed(() => data.value?.session.attendanceClosedAt != null)

  function fail(e: unknown) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }

  async function mark(place: Place, state: 'attended' | 'absent') {
    try {
      await act(`${base.value}/attendance`, { method: 'PUT', body: { marks: [{ placeId: place.id, state }] } })
      await refresh()
    }
    catch (e) {
      fail(e)
    }
  }

  async function close() {
    try {
      await act(`${base.value}/close`, { method: 'POST', body: {} })
      toast.add({ title: t('training.attendance.closed'), color: 'success' })
      await afterClose()
    }
    catch (e) {
      fail(e)
    }
  }

  return { places, marked, left, started, closed, mark, close }
}
