// An editor's ordered drafts, each kept by its key until the editor saves them all at once.
export function useDraftList<T extends { key: string }>() {
  const drafts = ref<T[]>([]) as Ref<T[]>
  function put(draft: T) {
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
  return { drafts, put, move, remove }
}
