import type { Ref } from 'vue'
import { onUnmounted, readonly, ref, watch } from '#imports'

/**
 * A ref that trails another, settling once it stops changing. `onSettle` fires
 * on the same tick, which is where a paginated caller resets to page 1.
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
