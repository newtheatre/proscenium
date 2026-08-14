import type { Ref } from 'vue'
import { onUnmounted, readonly, ref, watch } from '#imports'

/**
 * A ref that trails another one, settling only once it has stopped changing.
 * For search boxes feeding a server query: bind the input to `source` and put
 * the returned ref in the fetch's `watch` array.
 *
 * Hand-written rather than taken from `@vueuse/core`, which is only a
 * transitive dependency here.
 *
 * `onSettle` runs on the tick the value lands, which is where a paginated
 * caller resets to page 1 — doing that in a separate watcher races with the
 * fetch and can request page 7 of a two-page result.
 */
export function useDebouncedRef<T>(
  source: Ref<T>,
  options: { delay?: number, onSettle?: (value: T) => void } = {},
): Readonly<Ref<T>> {
  const { delay = 300, onSettle } = options
  const debounced = ref(source.value) as Ref<T>

  let timer: ReturnType<typeof setTimeout> | undefined

  watch(source, (value) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      debounced.value = typeof value === 'string' ? (value.trim() as T) : value
      onSettle?.(debounced.value)
    }, delay)
  })

  onUnmounted(() => clearTimeout(timer))

  return readonly(debounced) as Readonly<Ref<T>>
}
