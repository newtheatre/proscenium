// K8 A competency: holders and routes over its tabs, "Edit routes" as the one primary action, and
// details, making it active and retiring it in the menu. Retiring can be undone.
import type { Competency, Route } from '../../server/competencies'

export interface CompetencyView { competency: Competency, routes: Route[], holders: number | null, actions: { manage: boolean } }

export function useCompetencyRecord(id: Ref<string>, data: Ref<CompetencyView | undefined>, refresh: () => Promise<void>) {
  const { t } = useT()
  const act = useTrainingAct()
  const toast = useToast()
  const { offer } = useUndo()
  const { refusal, attempt } = useDialogAct()
  const path = computed(() => `/api/training/competencies/${encodeURIComponent(id.value)}`)
  const editing = ref(false)
  const setStatus = (to: 'activate' | 'retire') => act(`${path.value}/${to}`, { method: 'POST', body: {} })

  async function activate() {
    if (!await attempt(() => setStatus('activate'))) return
    toast.add({ title: t('training.competency-record.activated'), color: 'success' })
    await refresh()
  }
  async function retire() {
    if (!await attempt(() => setStatus('retire'))) return
    await refresh()
    offer(t('training.competency-record.retired', { title: data.value?.competency.title ?? '' }), async () => {
      await setStatus('activate')
      await refresh()
    })
  }

  const active = computed(() => data.value?.competency.status === 'active')
  const primary = computed(() => data.value?.actions.manage ? { label: t('training.competency-record.edit-routes'), icon: 'i-lucide-route' } : undefined)
  const actions = computed(() => {
    if (!data.value?.actions.manage) return []
    const state = active.value
      ? { label: t('training.competency-record.retire'), icon: 'i-lucide-archive', onSelect: () => { void retire() } }
      : { label: t('training.competency-record.activate'), icon: 'i-lucide-circle-check', onSelect: () => { void activate() } }
    return [[{ label: t('training.competency-record.edit-details'), icon: 'i-lucide-pencil', onSelect: () => { editing.value = true } }], [state]]
  })
  const summary = computed(() => {
    const d = data.value
    if (!d) return []
    return [
      { label: t('training.competency-record.routes'), value: String(d.routes.filter(r => r.status === 'active').length) },
      ...(d.holders === null ? [] : [{ label: t('training.competency-record.holders'), value: String(d.holders) }]),
    ]
  })
  const recordStatus = computed(() => data.value ? { label: t(`training.competency-states.${data.value.competency.status}`), tone: active.value ? 'success' as const : 'neutral' as const } : undefined)
  const onPrimary = () => navigateTo(`/console/training/competencies/${encodeURIComponent(id.value)}/routes`)
  return { refusal, editing, primary, onPrimary, actions, summary, recordStatus }
}
