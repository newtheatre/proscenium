// K8's routes editor (TR-35; R1, R5, R9): a competency's active routes as drafts that are added,
// changed, moved and removed here and saved together. A route taken out is retired by the server,
// never deleted. Saving says how many held the competency before and hold it now.
import type { Route } from '../../server/competencies'

export type RouteItemDraft = { kind: 'course', courseId: string, label: string } | { kind: 'recognised', requirementRef: string, label: string }
export interface RouteDraft { key: string, id?: string, label: string, items: RouteItemDraft[] }

let made = 0
export const newRoute = (): RouteDraft => ({ key: `new-${++made}`, label: '', items: [] })

function draftOf(route: Route): RouteDraft {
  return {
    key: route.id,
    id: route.id,
    label: route.label,
    items: route.items.map(i => i.kind === 'course'
      ? { kind: 'course' as const, courseId: i.courseId, label: i.courseTitle }
      : { kind: 'recognised' as const, requirementRef: i.requirementRef, label: i.label ?? i.requirementRef }),
  }
}

const itemBody = (i: RouteItemDraft) => i.kind === 'course' ? { kind: i.kind, courseId: i.courseId } : { kind: i.kind, requirementRef: i.requirementRef }

export function useRouteEditor(competencyId: Ref<string>, routes: Ref<Route[]>) {
  const { t } = useT()
  const act = useTrainingAct()
  const toast = useToast()
  const { refusal, busy: saving, attempt } = useDialogAct()
  const { drafts, put, move, remove } = useDraftList<RouteDraft>()
  watch(routes, (r) => { drafts.value = r.filter(x => x.status === 'active').map(draftOf) }, { immediate: true })
  const editing = ref<RouteDraft | null>(null)

  const save = () => attempt(async () => {
    const body = { routes: drafts.value.map(d => ({ id: d.id, label: d.label.trim(), status: 'active', items: d.items.map(itemBody) })) }
    const saved = await act<{ holders: { before: number, after: number } }>(`/api/training/competencies/${encodeURIComponent(competencyId.value)}/routes`, { method: 'PUT', body })
    toast.add({ title: t('training.route-editor.saved'), description: t('training.route-editor.holders', { before: saved.holders.before, after: saved.holders.after }), color: 'success' })
  })

  return { drafts, refusal, saving, editing, put, move, remove, save }
}

/** A route's items as words: "Fire safety and First aid". */
export function useRouteWords() {
  const { t } = useT()
  return (items: { label: string }[]) => items.length
    ? items.map(i => i.label).join(t('training.route-editor.and'))
    : t('training.route-editor.no-items')
}
