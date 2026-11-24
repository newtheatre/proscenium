// K2's step editor (TR-02, V1 to V3): the version in preparation's steps as drafts that are added,
// changed, moved and removed here and saved together. A saved step keeps its id, so sign-offs for it
// keep counting unless its author says it has changed.
import type { Step } from '../../server/courses'
import type { EVIDENCE_EXPIRY, EVIDENCE_FILE, NeededFor, SHOW_ANSWERS, StepKind } from '../../shared/states'

export interface StepDraft {
  key: string
  id?: string
  kind: StepKind
  title: string
  neededFor: NeededFor
  guidance: string
  materialUrl: string
  timesRequired: number
  sourceId: string | undefined
  sourceParams: Record<string, unknown>
  evidenceExpiry: typeof EVIDENCE_EXPIRY[number]
  evidenceFile: typeof EVIDENCE_FILE[number]
  qualifications: { title: string, issuers: string }[]
  otherQualification: boolean
  formId: string | undefined
  maxAttempts: number | null | undefined
  showAnswers: typeof SHOW_ANSWERS[number]
  changed: boolean
}

let made = 0
export function newDraft(kind: StepKind = 'practical'): StepDraft {
  return {
    key: `new-${++made}`, kind, title: '', neededFor: 'both', guidance: '', materialUrl: '', timesRequired: 1, sourceId: undefined, sourceParams: {},
    evidenceExpiry: 'optional', evidenceFile: 'optional', qualifications: [], otherQualification: true, formId: undefined, maxAttempts: undefined, showAnswers: 'after-pass', changed: false,
  }
}

export function draftOf(step: Step): StepDraft {
  return {
    ...newDraft(step.kind), key: step.id, id: step.id, title: step.title, neededFor: step.neededFor, guidance: step.guidance ?? '', materialUrl: step.materialUrl ?? '',
    timesRequired: step.timesRequired, sourceId: step.sourceId ?? undefined, sourceParams: step.sourceParams ?? {}, evidenceExpiry: step.evidenceExpiry ?? 'optional',
    evidenceFile: step.evidenceFile ?? 'optional', qualifications: (step.qualifications ?? []).map(q => ({ title: q.title, issuers: q.issuers.join(', ') })),
    otherQualification: step.otherQualification ?? true, formId: step.formId ?? undefined, maxAttempts: step.maxAttempts, showAnswers: step.showAnswers ?? 'after-pass',
  }
}

const text = (v: string) => v.trim() || null
const BY_KIND: Record<StepKind, (d: StepDraft) => Record<string, unknown>> = {
  session: d => ({ guidance: text(d.guidance), materialUrl: text(d.materialUrl) }),
  practical: d => ({ guidance: text(d.guidance), materialUrl: text(d.materialUrl), timesRequired: d.timesRequired }),
  reading: d => ({ guidance: text(d.guidance), materialUrl: text(d.materialUrl) }),
  activity: d => ({ guidance: text(d.guidance), sourceId: d.sourceId, sourceParams: d.sourceParams, timesRequired: d.timesRequired }),
  certificate: d => ({
    guidance: text(d.guidance), evidenceExpiry: d.evidenceExpiry, evidenceFile: d.evidenceFile, otherQualification: d.otherQualification,
    qualifications: d.qualifications.filter(q => q.title.trim()).map(q => ({ title: q.title.trim(), issuers: q.issuers.split(',').map(s => s.trim()).filter(Boolean) })),
  }),
  declaration: d => ({ guidance: text(d.guidance), evidenceFile: d.evidenceFile, formId: d.formId ?? null }),
  lesson: () => ({ guidance: null }),
  quiz: d => ({ guidance: text(d.guidance), formId: d.formId, maxAttempts: d.maxAttempts, showAnswers: d.showAnswers }),
}

/** What the steps route is sent for one draft. */
export function stepBody(d: StepDraft): Record<string, unknown> {
  return { id: d.id, kind: d.kind, title: d.title.trim(), neededFor: d.neededFor, changed: d.changed || undefined, ...BY_KIND[d.kind](d) }
}

export function useStepEditor(courseId: Ref<string>, steps: Ref<Step[]>) {
  const { t } = useT()
  const act = useTrainingAct()
  const toast = useToast()
  const { toRefusal } = useRefusal()
  const drafts = ref<StepDraft[]>([])
  watch(steps, (s) => { drafts.value = s.map(draftOf) }, { immediate: true })
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
  const saving = ref(false)
  const editing = ref<StepDraft | null>(null)

  function put(draft: StepDraft) {
    const i = drafts.value.findIndex(d => d.key === draft.key)
    if (i < 0) drafts.value.push(draft)
    else drafts.value.splice(i, 1, draft)
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= drafts.value.length) return
    const [item] = drafts.value.splice(from, 1)
    drafts.value.splice(to, 0, item!)
  }
  const remove = (key: string) => { drafts.value = drafts.value.filter(d => d.key !== key) }

  async function save(): Promise<boolean> {
    refusal.value = null
    saving.value = true
    try {
      await act(`/api/training/courses/${encodeURIComponent(courseId.value)}/steps`, { method: 'PUT', body: { steps: drafts.value.map(stepBody) } })
      toast.add({ title: t('training.step-editor.saved'), color: 'success' })
      return true
    }
    catch (e) {
      refusal.value = toRefusal(e)
      return false
    }
    finally {
      saving.value = false
    }
  }

  return { drafts, refusal, saving, editing, put, move, remove, save }
}
