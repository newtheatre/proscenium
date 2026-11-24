// Keep a copy and Download CSV (R1, REP-09, REP-10): each queues a run of the report as it is shown
// now. A copy is worked out in the background, so the copy's own page is where its file appears.
import type { ReportView } from '../../shared/reports'

export function useReportCopy(view: Ref<ReportView | undefined | null>, by: Ref<string | undefined>) {
  const { t } = useT()
  const { $api } = useNuxtApp()
  const toast = useRecordToast('reports:copy')
  const { toRefusal } = useRefusal()

  async function queue(): Promise<string | null> {
    const v = view.value
    if (!v) return null
    try {
      const body = {
        report: v.id,
        period: v.period.rule,
        ...(v.period.rule === 'chosen' ? { from: v.period.from, to: v.period.to } : {}),
        ...(v.scope.id ? { scope: `${v.scope.kind}:${v.scope.id}` } : {}),
        ...(by.value ? { by: by.value } : {}),
      }
      return (await $api<{ id: string }>(v.kind === 'people' ? '/api/reports/people/runs' : '/api/reports/runs', { method: 'POST', body })).id
    }
    catch (e) {
      const r = toRefusal(e)
      toast({ title: r.reason, description: r.remedy, color: 'error', icon: 'i-lucide-circle-alert' })
      return null
    }
  }

  async function keep() {
    const id = await queue()
    if (id && view.value?.kind === 'people') toast({ title: t('reports.people.kept'), description: t('reports.people.kept-description'), actions: [{ label: t('reports.copy.open'), to: `/console/reports/runs/${id}` }] })
    else if (id) toast({ title: t('reports.copy.kept'), description: t('reports.copy.kept-description'), actions: [{ label: t('reports.copy.open'), to: `/console/reports/runs/${id}` }] })
  }

  // A people report's CSV is made on the fly from the copy just kept (P4); a figures copy is made in the background.
  async function download() {
    const id = await queue()
    if (id && view.value?.kind === 'people') await navigateTo(`/api/reports/people/runs/${id}/csv`, { external: true })
    else if (id) await navigateTo(`/console/reports/runs/${id}`)
  }

  return { keep, download }
}
