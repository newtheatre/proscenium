// M6 and M12's form (E1 to E4, E7): the fields a certificate or declaration step asks for, the file
// uploaded first under its own evidence id, and a short wait while core checks the file.
import type { StepAction } from '../../server/learner'

export type EvidenceStep = { id: string, title: string, action: Extract<StepAction, { kind: 'certificate' | 'declaration' }> }

const OTHER = '__other' // not-policy: the value of "Something else" in the qualification list
const CHECK_EVERY = 1500 // not-policy: how long to wait between asking whether the file has been checked
const CHECK_TRIES = 8 // not-policy: how many times to ask before giving up

const blank = () => ({ qualification: '', otherQualification: '', issuer: '', issuedOn: '', expiresOn: '', reference: '', statement: '', organisation: '', doneFrom: '', doneTo: '', linkUrl: '', referee: '', file: null as File | null })

export function useEvidenceForm(courseId: Ref<string>, step: Ref<EvidenceStep | null>) {
  const { t } = useT()
  const { $api } = useNuxtApp()
  const act = useTrainingAct()
  const form = reactive(blank())
  const certificate = computed(() => step.value?.action.kind === 'certificate')
  const listed = computed(() => step.value?.action.qualifications ?? [])
  const qualificationItems = computed(() => [
    ...listed.value.map(q => ({ value: q.title, label: q.title })),
    ...(step.value?.action.otherQualification ? [{ value: OTHER, label: t('training.evidence.something-else') }] : []),
  ])
  const issuers = computed(() => listed.value.find(q => q.title === form.qualification)?.issuers ?? [])
  const shows = computed(() => ({
    file: step.value?.action.file !== 'forbidden',
    expiry: certificate.value && step.value?.action.expiry !== 'none',
    otherQualification: !listed.value.length || form.qualification === OTHER,
  }))
  // With one qualification and nothing else on offer, it is already chosen.
  watch(step, () => Object.assign(form, blank(), qualificationItems.value.length === 1 ? { qualification: qualificationItems.value[0]!.value } : {}), { immediate: true })

  const check = () => needs({
    ...(certificate.value
      ? {
          issuer: form.issuer,
          issuedOn: form.issuedOn,
          ...(listed.value.length ? { qualification: form.qualification } : {}),
          ...(step.value?.action.expiry === 'required' ? { expiresOn: form.expiresOn } : {}),
        }
      : { statement: form.statement }),
    ...(step.value?.action.file === 'required' ? { file: form.file } : {}),
  })

  async function upload(file: File): Promise<{ evidenceId: string, fileId: string }> {
    return $api<{ evidenceId: string, fileId: string }>(`/api/training/courses/${encodeURIComponent(courseId.value)}/steps/${encodeURIComponent(step.value!.id)}/evidence-file`, {
      method: 'POST', query: { name: file.name }, body: file, headers: { 'content-type': file.type || 'application/octet-stream' },
    })
  }

  const text = (v: string) => v.trim() || null
  /** Sends the evidence; a file still being checked is asked about again a few times before the refusal stands. */
  async function send(): Promise<void> {
    const file = form.file ? await upload(form.file) : null
    const qualification = form.qualification === OTHER || !listed.value.length ? text(form.otherQualification) : form.qualification
    const body = {
      stepId: step.value!.id,
      ...(file ?? {}),
      ...(certificate.value
        ? { qualification, issuer: text(form.issuer), issuedOn: form.issuedOn, expiresOn: form.expiresOn || null, reference: text(form.reference) }
        : { statement: text(form.statement), organisation: text(form.organisation), doneFrom: form.doneFrom || null, doneTo: form.doneTo || null, linkUrl: text(form.linkUrl), referee: text(form.referee) }),
    }
    for (let tries = 1; ; tries++) {
      try {
        await act(`/api/training/courses/${encodeURIComponent(courseId.value)}/evidence`, { method: 'POST', body })
        return
      }
      catch (e) {
        const data = (e as { data?: { code?: string, remedy?: string } }).data
        if (data?.code !== 'core.files.not-ready' || data.remedy || tries >= CHECK_TRIES) throw e
        await new Promise(resolve => setTimeout(resolve, CHECK_EVERY))
      }
    }
  }

  return { form, certificate, qualificationItems, issuers, shows, check, send }
}
