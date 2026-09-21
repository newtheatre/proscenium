import { getCurrentInstance, onBeforeUnmount, onMounted } from 'vue'

// A poll that also checks on every return to a backgrounded tab. A cutoff guards a runaway loop;
// the caller's own state decides when it actually stops.

export function usePendingPoll() {
  let timer: ReturnType<typeof setInterval> | undefined
  let tick: (() => void | Promise<void>) | undefined
  let until = Infinity

  function stop(): void {
    if (timer) clearInterval(timer)
    timer = undefined
    tick = undefined
  }

  function start(onTick: () => void | Promise<void>, intervalMs: number, cutoffMs: number): void {
    stop()
    tick = onTick
    until = Date.now() + cutoffMs
    timer = setInterval(() => {
      if (Date.now() > until) {
        stop()
        return
      }
      void onTick()
    }, intervalMs)
  }

  function onReturnToTab(): void {
    if (document.visibilityState === 'visible' && tick) void tick()
  }

  // Inside a component only: the unit test drives the till's composables with no instance.
  if (getCurrentInstance()) {
    onMounted(() => {
      document.addEventListener('visibilitychange', onReturnToTab)
      window.addEventListener('focus', onReturnToTab)
      window.addEventListener('pageshow', onReturnToTab)
    })

    onBeforeUnmount(() => {
      stop()
      document.removeEventListener('visibilitychange', onReturnToTab)
      window.removeEventListener('focus', onReturnToTab)
      window.removeEventListener('pageshow', onReturnToTab)
    })
  }

  return { start, stop }
}
