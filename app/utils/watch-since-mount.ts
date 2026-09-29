import { getCurrentInstance, onMounted, watch } from 'vue'
import type { WatchSource } from 'vue'

// A watcher set up after a served read has already filled its source never sees it change, so this
// also runs once mounted; outside a component, as a unit test drives it, it is a plain watcher.
export function watchSinceMount(source: WatchSource<unknown> | WatchSource<unknown>[], run: () => void): void {
  watch(source, () => run())
  if (getCurrentInstance()) onMounted(run)
}
