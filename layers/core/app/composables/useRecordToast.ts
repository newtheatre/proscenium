// One toast at a time for a record page: each new one takes the last one's place, so a change made
// in the side panel and then on a tab never stacks two toasts over the page.
type Toast = Parameters<ReturnType<typeof useToast>['add']>[0]

export function useRecordToast(key: string) {
  const toast = useToast()
  const last = useState<string | null>(`core:record-toast:${key}`, () => null)
  return (shown: Partial<Toast>) => {
    if (last.value) toast.remove(last.value)
    last.value = String(toast.add({ color: 'success', icon: 'i-lucide-circle-check', ...shown }).id)
  }
}
