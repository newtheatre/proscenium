// M9 Sign someone off (TR-05): a course the reader trains, a person, the practical steps to sign with
// how many times each is done, the day and a note. One tap signs every ticked step; Undo voids them.
import type { Teaching } from '../../server/teaching'

interface StepDone { stepId: string, title: string, needed: number, done: number, met: boolean }

export function useSignOffForm(teaching: Ref<Teaching | undefined>, startCourse: string | undefined) {
  const { t } = useT()
  const { $api } = useNuxtApp()
  const act = useTrainingAct()
  const { offer } = useUndo()
  const { toRefusal } = useRefusal()

  const courses = computed(() => (teaching.value?.courses ?? []).filter(c => c.steps.length))
  const form = reactive({ courseId: '', accountId: undefined as string | undefined, steps: [] as string[], occurredOn: '', note: '' })
  const person = ref<string | null>(null)
  const progress = ref<StepDone[] | null>(null)
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

  watch(teaching, (d) => {
    if (!d) return
    if (!form.occurredOn) form.occurredOn = d.today
    if (!form.courseId) form.courseId = courses.value.find(c => c.id === startCourse)?.id ?? (courses.value.length === 1 ? courses.value[0]!.id : '')
  }, { immediate: true })

  const course = computed(() => courses.value.find(c => c.id === form.courseId))
  const courseItems = computed(() => courses.value.map(c => ({ value: c.id, label: c.title })))

  async function loadProgress() {
    progress.value = null
    if (!form.courseId || !form.accountId) return
    try {
      progress.value = (await $api<{ steps: StepDone[] }>('/api/training/teaching/progress', { query: { courseId: form.courseId, accountId: form.accountId } })).steps
    }
    catch {
      progress.value = null
    }
  }
  watch(() => [form.courseId, form.accountId], () => {
    form.steps = []
    refusal.value = null
    void loadProgress()
  })

  /** Each practical step with what it needs and, once a person is chosen, how far they are. */
  const stepItems = computed(() => (course.value?.steps ?? []).map((s) => {
    const p = progress.value?.find(x => x.stepId === s.id)
    const needed = t('training.sign-off.needed', { count: s.timesRequired })
    const so = !p ? '' : p.met ? t('training.sign-off.met') : t('training.sign-off.so-far', { done: p.done, needed: p.needed })
    return { value: s.id, label: s.title, description: [needed, so].filter(Boolean).join(' ') }
  }))

  const submitLabel = computed(() => person.value && form.steps.length
    ? t('training.sign-off.submit-for', { count: form.steps.length, name: person.value })
    : t('training.sign-off.submit'))

  const validate = () => needs({ courseId: form.courseId, accountId: form.accountId, steps: form.steps, occurredOn: form.occurredOn })

  async function submit() {
    refusal.value = null
    const done: string[] = []
    try {
      for (const stepId of form.steps) {
        const signed = await act<{ signOffId: string }>(`/api/training/courses/${encodeURIComponent(form.courseId)}/sign-offs`, {
          method: 'POST',
          body: { accountId: form.accountId, stepId, occurredOn: form.occurredOn, note: form.note.trim() || null },
        })
        done.push(signed.signOffId)
      }
    }
    catch (e) {
      refusal.value = toRefusal(e)
    }
    if (!done.length) return
    const note = t('training.sign-off.undo-note')
    offer(t('training.sign-off.done', { count: done.length, name: person.value ?? '' }), async () => {
      for (const id of done) await act(`/api/training/sign-offs/${encodeURIComponent(id)}/void`, { method: 'POST', body: { note } })
      await loadProgress()
    })
    form.steps = []
    form.note = ''
    await loadProgress()
  }

  return { form, person, course, courses, courseItems, stepItems, submitLabel, refusal, validate, submit }
}
