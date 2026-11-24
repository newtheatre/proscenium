// Archiving a saved report (REP-13), with Undo in the toast.
export function useReportArchive() {
  const { t } = useT()
  const { $api } = useNuxtApp()
  const { offer } = useUndo()
  const { toRefusal } = useRefusal()
  const toast = useToast()

  async function archive(id: string, name: string, after?: () => unknown) {
    const send = (archived: boolean) => $api(`/api/reports/definitions/${id}/archive`, { method: 'POST', body: { archived } })
    try {
      await send(true)
      await refreshNuxtData('reports:definitions')
      offer(t('reports.archived-toast', { name }), async () => {
        await send(false)
        await refreshNuxtData('reports:definitions')
      })
      await after?.()
    }
    catch (e) {
      const r = toRefusal(e)
      toast.add({ title: r.reason, description: r.remedy, color: 'error' })
    }
  }

  return { archive }
}
