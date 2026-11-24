// A claim as its pages read it, and what both the claimant's page and the review page do with it.
import type { ClaimState } from './useBudgetText'

export interface ClaimReceipt { id: string, name: string | null, state: string, mediaType: string }
export interface ClaimItem {
  id: string
  spentOn: string
  description: string
  supplier: string | null
  amountMinor: number
  lineId: string | null
  lineName: string | null
  budgetId: string | null
  budgetName: string | null
  categoryId: string | null
  categoryName: string | null
  noReceiptReason: string | null
  approvedMinor: number | null
  partReason: string | null
  receipts: ClaimReceipt[]
}
export interface ClaimEvent { action: string, by: string | null, byName: string | null, at: number, amountMinor?: number | null, note?: string | null }
export interface ClaimView {
  claim: { id: string, number: string | null, title: string, state: ClaimState, currency: string, totalMinor: number, approvedMinor: number | null, paidMinor: number, requestId: string | null, submittedAt: number | null, version: number, claimant: string | null }
  items: ClaimItem[]
  events: ClaimEvent[]
  mine: boolean
  review: { yours: string[], overMinor: number, marks: { lateItems: string[], notAskedFirst: boolean }, any: boolean } | null
  canVoid: boolean
}

/** The claim the page's address names. */
export async function useClaim() {
  const route = useRoute()
  const id = computed(() => String(route.params.id))
  const { t } = useT()
  const { $api } = useNuxtApp()
  const { toRefusal } = useRefusal()
  const toast = useToast()
  const request = await useAPI<ClaimView>(() => `/api/budgets/claims/${id.value}`, { key: `budgets:claim:${id.value}` })

  /** Posts to one of the claim's actions; a refusal is a toast, and the claim is read again either way. */
  async function act(path: string, body: Record<string, unknown>, done: string): Promise<boolean> {
    try {
      await $api(`/api/budgets/claims/${id.value}${path}` as string, { method: 'POST', body })
      toast.add({ title: t(done), color: 'success' })
      return true
    }
    catch (e) {
      const refusal = toRefusal(e)
      toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
      return false
    }
    finally {
      await request.refresh()
    }
  }
  const title = computed(() => {
    const c = request.data.value?.claim
    return c ? (c.number ? t('budgets.screens.claims.numbered', { number: c.number, title: c.title }) : c.title) : ''
  })
  return { ...request, id, act, title }
}
