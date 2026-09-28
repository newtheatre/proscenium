import type { Ref } from 'vue'

// The instant a screen judges the running house, doors and the curtain by: each read's own moment,
// so the served page and the hydrating phone agree, and the phone's own clock once it has mounted.
export function useNightClock(): { now: Ref<number>, stamp: (at: number) => void } {
  const now = ref(Date.now())
  onMounted(() => {
    now.value = Date.now()
  })
  function stamp(at: number): void {
    now.value = at
  }
  return { now, stamp }
}
