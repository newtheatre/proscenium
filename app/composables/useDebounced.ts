import type { Ref } from 'vue'

// A search that fires on every keystroke asks the server a question the typist has not finished.
// Small enough to own rather than take a dependency for.
export function useDebounced<T>(source: Ref<T>, delayMs = 250): Ref<T> {
  const settled = ref(source.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | undefined

  watch(source, (value) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      settled.value = value
    }, delayMs)
  })

  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
  })

  return settled
}
