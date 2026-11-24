// The builder's state (FB-201): the draft definition, every step for undo and redo, what is
// selected, and saving. Each edit replaces the definition with a new one; a change is saved within
// two seconds with no Save button, and a save from a stale revision stops saving and says so.
import type { ComputedRef, InjectionKey, Ref, ShallowRef } from 'vue'
import { checkDefinition, type Definition, type Problem } from '../../shared/engine'
import { find } from '../../shared/builder/edit'

export interface BuilderForm { id: string, slug: string, title: string, mode: string, status: string, anonymous: boolean, allowEdits: boolean, retentionDays: number | null, retentionDeclinedDays: number | null, liveVersion: number | null, archivedAt: number | null }
export interface PublishedField { questionId: string, key: string, type: string, dataClass: string, retired: boolean }
export interface BuilderAction { key: string, label: string, slot: string | null, inputs: { key: string, label: string, required: boolean, types?: string[] }[] }
export interface BuilderData {
  today: string | null
  requireRetention?: boolean
  shared?: boolean
  /** Whether this person may read the form's responses, which decides the Responses tab. */
  canRead?: boolean
  form: BuilderForm
  draft: { definition: Definition, editRevision: number, editedBy: string | null, updatedAt: number }
  fields: PublishedField[]
  /** For the stages editor: roles whose holders can review, and the names of people a stage names. */
  reviewers?: { roles: { id: string, name: string }[], people: Record<string, string> }
  /** Where a "record from a source" question may choose from now. */
  sources?: { key: string, label: string, people: boolean }[]
  actions?: BuilderAction[]
  /** Whether this person may save the form as a template for the theatre. */
  canSaveTemplate?: boolean
  /** Whether this person may set correct answers, points and the pass mark (FB-513). */
  canMark?: boolean
  versions: { id: string, number: number, publishedAt: number }[]
}
export type SaveState = 'saved' | 'waiting' | 'saving' | 'stale' | 'failed'

const SAVE_AFTER = 800 // not-policy: milliseconds of quiet before a save, inside the specification's two seconds
const MERGE_WITHIN = 1500 // not-policy: typing in one field within this many milliseconds is one undo step
const MOST_STEPS = 200 // not-policy: undo steps kept in a session

export interface FormBuilder {
  definition: ShallowRef<Definition>
  revision: Ref<number>
  state: Ref<SaveState>
  failure: Ref<string | null>
  selected: Ref<string | null>
  /** Custom fields, filled in on their record: nobody is greeted, thanked or asked to send. */
  record: boolean
  pageId: Ref<string>
  problems: ComputedRef<Problem[]>
  problemsAt: ComputedRef<Map<string, Problem[]>>
  published: ComputedRef<Map<string, PublishedField>>
  sources: ComputedRef<{ key: string, label: string, people: boolean }[]>
  /** What other modules can do when a response takes a move. */
  actions: ComputedRef<BuilderAction[]>
  /** Whether correct answers and the pass mark are shown and may be changed. */
  canMark: boolean
  canUndo: ComputedRef<boolean>
  canRedo: ComputedRef<boolean>
  /** Replaces the definition. Edits with the same `merge` name close together are one undo step. */
  apply: (next: Definition, merge?: string) => void
  undo: () => void
  redo: () => void
  select: (id: string | null) => void
  /** Saves now, if there is anything to save, and resolves when the server has it. */
  flush: () => Promise<void>
}
export const FORM_BUILDER: InjectionKey<FormBuilder> = Symbol('forms.builder')
export const useBuilder = (): FormBuilder => inject(FORM_BUILDER)!

export function useFormBuilder(data: BuilderData, fields: () => PublishedField[]): FormBuilder {
  const { $api } = useNuxtApp()
  const { toRefusal } = useRefusal()
  const definition = shallowRef<Definition>(data.draft.definition)
  const revision = ref(data.draft.editRevision)
  const state = ref<SaveState>('saved')
  const failure = ref<string | null>(null)
  const selected = ref<string | null>(null)
  const pageId = ref(definition.value.pages[0]!.id)
  const past = shallowRef<Definition[]>([])
  const future = shallowRef<Definition[]>([])
  let lastMerge: { name: string, at: number } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let running: Promise<void> | null = null
  let dirty = false

  async function save(): Promise<void> {
    if (state.value === 'stale') return
    while (dirty) {
      dirty = false
      state.value = 'saving'
      try {
        const saved = await $api<{ editRevision: number }>(`/api/forms/forms/${data.form.id}/draft`, { method: 'PUT', body: { definition: definition.value, editRevision: revision.value } })
        revision.value = saved.editRevision
        failure.value = null
        if (!dirty) state.value = 'saved'
      }
      catch (e) {
        const refusal = toRefusal(e)
        failure.value = [refusal.reason, refusal.remedy].filter(Boolean).join(' ')
        state.value = refusal.code === 'forms.draft.stale' ? 'stale' : 'failed'
        return
      }
    }
  }
  function flush(): Promise<void> {
    if (timer) clearTimeout(timer)
    timer = null
    running = (running ?? Promise.resolve()).then(save).finally(() => { running = null })
    return running
  }
  function changed() {
    if (state.value === 'stale') return
    dirty = true
    state.value = 'waiting'
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, SAVE_AFTER)
  }

  /** Keeps the selection and the open page on things that still exist. */
  function settle() {
    const def = definition.value
    if (selected.value && !selected.value.startsWith('form:') && !find(def, selected.value) && !def.endings?.some(e => e.id === selected.value) && !def.calculations?.some(c => c.id === selected.value)) selected.value = null
    if (!def.pages.some(p => p.id === pageId.value)) pageId.value = def.pages[0]!.id
  }
  function apply(next: Definition, merge?: string) {
    if (next === definition.value) return
    const at = Date.now()
    const merged = !!merge && lastMerge?.name === merge && at - lastMerge.at < MERGE_WITHIN
    if (!merged) past.value = [...past.value.slice(-MOST_STEPS + 1), definition.value]
    lastMerge = merge ? { name: merge, at } : null
    future.value = []
    definition.value = next
    settle()
    changed()
  }
  function step(from: ShallowRef<Definition[]>, to: ShallowRef<Definition[]>) {
    const next = from.value.at(-1)
    if (!next) return
    from.value = from.value.slice(0, -1)
    to.value = [...to.value, definition.value]
    definition.value = next
    lastMerge = null
    settle()
    changed()
  }
  function select(id: string | null) {
    selected.value = id
    const found = id ? find(definition.value, id) : null
    if (found) pageId.value = found.page.id
    // A calculation shown on a page opens that page, where its line is.
    const shownOn = definition.value.calculations?.find(c => c.id === id)?.page
    if (shownOn && definition.value.pages.some(p => p.id === shownOn)) pageId.value = shownOn
  }

  const problems = computed(() => checkDefinition(definition.value, { ...(data.sources ? { sources: data.sources.map(s => s.key) } : {}), ...(data.actions ? { actions: data.actions } : {}) }))
  const problemsAt = computed(() => {
    const map = new Map<string, Problem[]>()
    for (const p of problems.value) map.set(p.at, [...(map.get(p.at) ?? []), p])
    return map
  })
  return {
    record: data.form.mode === 'record',
    definition, revision, state, failure, selected, pageId, problems, problemsAt,
    published: computed(() => new Map(fields().map(f => [f.questionId, f]))),
    sources: computed(() => data.sources ?? []),
    actions: computed(() => data.actions ?? []),
    canMark: !!data.canMark,
    canUndo: computed(() => past.value.length > 0),
    canRedo: computed(() => future.value.length > 0),
    apply,
    undo: () => step(past, future),
    redo: () => step(future, past),
    select,
    flush,
  }
}
