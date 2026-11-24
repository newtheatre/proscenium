// M7's "Allow another try" (Q6, TR-45): an allowance cannot be taken back, so a plain toast says it is done.
import type { TriesUsed } from '../../server/teaching'

export function useAnotherTry(refresh: () => Promise<void>) {
  const { t } = useT()
  const act = useTrainingAct()
  const toast = useToast()
  const { toRefusal } = useRefusal()

  async function allow(p: TriesUsed) {
    try {
      await act(`/api/training/courses/${encodeURIComponent(p.courseId)}/steps/${encodeURIComponent(p.stepId)}/allowances`, { method: 'POST', body: { accountId: p.accountId } })
      toast.add({ title: t('training.teaching.allowed', { name: p.name ?? t('training.teaching.no-name') }), color: 'success' })
      await refresh()
    }
    catch (e) {
      const refusal = toRefusal(e)
      toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
    }
  }

  return { allow }
}
