// Setup can be left and resumed. A flow's entries and place are kept on this device under its key;
// the console shows an unfinished setup as a card on home and a mark on the module.
export interface StepsProgress { index: number, state: Record<string, unknown>, at: number }

const keyOf = (flow: string) => `proscenium:steps:${flow}`

export function readProgress(flow: string): StepsProgress | null {
  try {
    const raw = localStorage.getItem(keyOf(flow))
    return raw ? JSON.parse(raw) as StepsProgress : null
  }
  catch { return null }
}

export function writeProgress(flow: string, progress: StepsProgress | null): void {
  try {
    if (progress) localStorage.setItem(keyOf(flow), JSON.stringify(progress))
    else localStorage.removeItem(keyOf(flow))
  }
  catch { /* no storage (a private window): the flow still works, it just cannot be resumed */ }
}

/** Whether a flow has been started and not finished, for the "continue setup" card. */
export function useStepsProgress(flow: string) {
  const progress = ref<StepsProgress | null>(null)
  onMounted(() => { progress.value = readProgress(flow) })
  return { progress, resumable: computed(() => progress.value !== null) }
}
