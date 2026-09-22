import type { Ref } from 'vue'

export interface DiscardGuard {
  // Set by the section that holds typed copy, cleared when it is saved or discarded.
  changed: Ref<boolean>
  asking: Ref<boolean>
  // True when the move was held back and the caller should do nothing further this tick.
  hold: (move: () => void) => boolean
  discard: () => void
}

// D-132 criterion 9: a section that unmounts takes whatever is typed in it, so the move is held
// until the reader answers, and going back leaves both the change and where they are alone.
export function useDiscardGuard(): DiscardGuard {
  const changed = ref(false)
  const asking = ref(false)
  const held = ref<(() => void) | null>(null)

  watch(asking, (value) => {
    if (!value) held.value = null
  })

  function hold(move: () => void): boolean {
    if (!changed.value) return false
    held.value = move
    asking.value = true
    return true
  }

  function discard(): void {
    const move = held.value
    changed.value = false
    asking.value = false
    held.value = null
    move?.()
  }

  return { changed, asking, hold, discard }
}
