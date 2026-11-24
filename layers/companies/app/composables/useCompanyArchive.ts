// Archiving and restoring a company (G6, CO-09) from the list or its page: done at once, with Undo.
export function useCompanyArchive(refresh: () => Promise<unknown>) {
  const { t } = useT()
  const { $api } = useNuxtApp()
  const { toRefusal } = useRefusal()
  const { offer } = useUndo()
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

  const shift = (id: string, to: 'archive' | 'restore') => $api(`/api/companies/${encodeURIComponent(id)}/${to}` as string, { method: 'POST', body: {} })
  async function set(company: { id: string, name: string }, archived: boolean) {
    refusal.value = null
    try {
      await shift(company.id, archived ? 'archive' : 'restore')
      await refresh()
      offer(t(archived ? 'companies.archived-done' : 'companies.restored-done', { name: company.name }), async () => {
        await shift(company.id, archived ? 'restore' : 'archive')
        await refresh()
      })
    }
    catch (e) {
      refusal.value = toRefusal(e)
    }
  }
  return {
    refusal,
    archive: (company: { id: string, name: string }) => set(company, true),
    restore: (company: { id: string, name: string }) => set(company, false),
  }
}
