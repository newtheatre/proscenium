// Whether a flow has been started and not finished, for the "continue setup" card. Reading and
// writing the saved place is in utils/steps-progress.ts.
export function useStepsProgress(flow: string) {
  const progress = ref<StepsProgress | null>(null)
  onMounted(() => { progress.value = readProgress(flow) })
  return { progress, resumable: computed(() => progress.value !== null) }
}
