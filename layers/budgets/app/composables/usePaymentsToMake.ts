// Payments to make (BC-29): approved claims still owed, grouped by claimant and route, with whether
// bank details are on file for each. A payment is made to one person by one route, so a selection
// stays within one group.
import type { PayRoute } from './useClaim'

export interface ClaimToPay { id: string, number: string | null, title: string, claimantId: string | null, claimant: string, payRoute: PayRoute, currency: string, approvedMinor: number, paidMinor: number, owedMinor: number, decidedAt: number | null }
export interface PayGroup { key: string, claimant: string, route: PayRoute, currency: string, owedMinor: number, claims: ClaimToPay[] }
interface Payee { held: boolean, initial: string | null, lastDigits: string | null }

export async function usePaymentsToMake() {
  const { $api } = useNuxtApp()
  const request = await useAPI<{ claims: ClaimToPay[], routes: PayRoute[] }>('/api/budgets/to-pay', { key: 'budgets:to-pay' })
  const groups = computed<PayGroup[]>(() => {
    const out = new Map<string, PayGroup>()
    for (const c of request.data.value?.claims ?? []) {
      const key = `${c.claimantId ?? c.id}|${c.payRoute}`
      const group = out.get(key) ?? { key, claimant: c.claimant, route: c.payRoute, currency: c.currency, owedMinor: 0, claims: [] }
      group.claims.push(c)
      group.owedMinor += c.owedMinor
      out.set(key, group)
    }
    return [...out.values()]
  })

  // Masked bank details for the claims paid by transfer; unknown while Payments does not answer.
  const payees = ref<Record<string, Payee | null>>({})
  watch(() => request.data.value?.claims, async (claims) => {
    const records = (claims ?? []).filter(c => c.payRoute === 'bank-transfer').map(c => c.id)
    if (!records.length) return
    try {
      payees.value = (await $api<{ payees: Record<string, Payee | null> }>('/api/payments/disbursements/payees', { query: { owner: 'budgets', records: records.join(',') } })).payees
    }
    catch { payees.value = {} }
  }, { immediate: true })
  const payeeOf = (group: PayGroup): Payee | null | undefined => group.route === 'bank-transfer' ? payees.value[group.claims[0]!.id] : undefined

  const selected = ref<Set<string>>(new Set())
  const selectedGroup = computed(() => groups.value.find(g => g.claims.some(c => selected.value.has(c.id))) ?? null)
  function toggle(group: PayGroup, claimId: string, on: boolean) {
    const next = new Set(selectedGroup.value?.key === group.key ? selected.value : [])
    if (on) next.add(claimId)
    else next.delete(claimId)
    selected.value = next
  }
  const chosen = computed(() => selectedGroup.value?.claims.filter(c => selected.value.has(c.id)) ?? [])
  const chosenMinor = computed(() => chosen.value.reduce((sum, c) => sum + c.owedMinor, 0))
  return { ...request, groups, payeeOf, selected, toggle, chosen, chosenMinor, selectedGroup }
}
