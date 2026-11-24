// K2 A course: the record's facts, its one primary action by state and the rest in a menu. A version in
// preparation is published; otherwise "Edit steps" starts the next version and opens the editor.
import type { Course, Step, Trainer, Version } from '../../server/courses'
import type { CourseOverview } from '../../server/console'

export interface CourseView {
  course: Course
  live: Step[]
  preparing: { version: Version, steps: Step[] } | null
  versions: Version[]
  trainers: (Trainer & { name: string | null })[]
  overview: CourseOverview | null
  actions: { manage: boolean, signOff: boolean, award: boolean }
}

const TONE = { unpublished: 'neutral', live: 'success', retired: 'neutral' } as const

export function useCourseRecord(id: Ref<string>, data: Ref<CourseView | undefined>, refresh: () => Promise<void>) {
  const { t } = useT()
  const act = useTrainingAct()
  const toast = useToast()
  const { offer } = useUndo()
  const { toRefusal } = useRefusal()
  const path = computed(() => `/api/training/courses/${encodeURIComponent(id.value)}`)
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
  const editing = ref(false)
  const publishing = ref(false)

  async function run(what: () => Promise<unknown>): Promise<boolean> {
    refusal.value = null
    try {
      await what()
      await refresh()
      return true
    }
    catch (e) {
      refusal.value = toRefusal(e)
      return false
    }
  }

  const editorPath = computed(() => `/console/training/courses/${encodeURIComponent(id.value)}/steps`)
  async function editSteps() {
    if (data.value?.preparing) return navigateTo(editorPath.value)
    if (await run(() => act(`${path.value}/versions`, { method: 'POST', body: {} }))) await navigateTo(editorPath.value)
  }

  async function setRetired(retire: boolean) {
    const title = data.value?.course.title ?? ''
    if (!await run(() => act(`${path.value}/${retire ? 'retire' : 'revive'}`, { method: 'POST', body: {} }))) return
    if (!retire) return toast.add({ title: t('training.course-record.revived', { title }), color: 'success' })
    offer(t('training.course-record.retired', { title }), async () => {
      await act(`${path.value}/revive`, { method: 'POST', body: {} })
      await refresh()
    })
  }

  const status_ = computed(() => data.value ? { label: t(`training.course-states.${data.value.course.status}`), tone: TONE[data.value.course.status] } : undefined)
  const primary = computed(() => {
    const d = data.value
    if (!d?.actions.manage) return undefined
    if (d.preparing) return { label: t('training.course-record.publish'), icon: 'i-lucide-send', hint: d.preparing.steps.length ? undefined : t('training.course-record.no-steps') }
    if (d.course.status === 'retired') return undefined
    return { label: t('training.course-record.edit-steps'), icon: 'i-lucide-list-ordered' }
  })
  function onPrimary() {
    if (data.value?.preparing) publishing.value = true
    else void editSteps()
  }
  const actions = computed(() => {
    const d = data.value
    if (!d?.actions.manage) return []
    const first = [{ label: t('training.course-record.edit-details'), icon: 'i-lucide-pencil', onSelect: () => { editing.value = true } }]
    if (d.preparing) first.push({ label: t('training.course-record.edit-steps'), icon: 'i-lucide-list-ordered', onSelect: () => { void editSteps() } })
    const last = d.course.status === 'live'
      ? [{ label: t('training.course-record.retire'), icon: 'i-lucide-archive', onSelect: () => { void setRetired(true) } }]
      : d.course.status === 'retired' ? [{ label: t('training.course-record.revive'), icon: 'i-lucide-archive-restore', onSelect: () => { void setRetired(false) } }] : []
    return last.length ? [first, last] : [first]
  })
  return { refusal, editing, publishing, primary, onPrimary, actions, summary: useCourseSummary(data), recordStatus: status_, run }
}

/** The facts above K2's tabs: version, how long training lasts, and for a manager holders, those lapsing and the next session. */
function useCourseSummary(data: Ref<CourseView | undefined>) {
  const { t } = useT()
  const { dateTime } = useDates()
  const lasts = (seconds: number) => {
    const { unit, count } = validityParts(seconds)
    return t(`training.durations.${unit}`, { count })
  }
  return computed(() => {
    const d = data.value
    if (!d) return []
    const live = d.versions.find(v => v.status === 'live')
    const o = d.overview
    return [
      { label: t('training.course-record.version'), value: live ? t('training.courses-list.version', { number: live.number }) : t('training.courses-list.no-version') },
      { label: t('training.course-record.valid-for'), value: d.course.validFor ? lasts(d.course.validFor) : t('training.course-record.never-lapses') },
      ...(o
        ? [
            { label: t('training.course-record.holders'), value: String(o.holders) },
            { label: t('training.course-record.lapsing'), value: String(o.lapsing) },
            { label: t('training.course-record.next-session'), value: o.nextSession ? dateTime(o.nextSession.startsAt) : t('training.course-record.no-session') },
          ]
        : []),
    ]
  })
}
