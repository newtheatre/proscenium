// The writes every Inventory set-up screen makes against one list (S10): add or change a row, archive
// or restore it with Undo, and make the starting list. A refusal is kept for the screen to show.
export function useInventorySetup(base: string, refresh: () => Promise<unknown> | unknown) {
  const { $api } = useNuxtApp()
  const { toRefusal } = useRefusal()
  const toast = useToast()
  const undo = useUndo()
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

  async function attempt(work: () => Promise<unknown>): Promise<boolean> {
    refusal.value = null
    try {
      await work()
      return true
    }
    catch (e) {
      refusal.value = toRefusal(e)
      return false
    }
  }

  async function save(id: string | null, body: object, done: string): Promise<boolean> {
    const saved = await attempt(() => id ? $api(`${base}/${id}`, { method: 'PUT', body }) : $api(base, { method: 'POST', body }))
    if (saved) {
      toast.add({ title: done, color: 'success' })
      await refresh()
    }
    return saved
  }

  async function setArchived(id: string, archive: boolean, said: string): Promise<void> {
    const call = (to: boolean) => $api(`${base}/${id}/state`, { method: 'POST', body: { to: to ? 'archived' : 'active' } })
    if (!await attempt(() => call(archive))) return
    undo.offer(said, async () => {
      await call(!archive)
      await refresh()
    })
    await refresh()
  }

  async function start(said: (made: number) => string): Promise<void> {
    let made = 0
    if (!await attempt(async () => { made = (await $api<{ made: number }>(`${base}/start`, { method: 'POST', body: {} })).made })) return
    toast.add({ title: said(made), color: 'success' })
    await refresh()
  }

  return { refusal, save, setArchived, start }
}
