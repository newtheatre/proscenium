// The kit desk (S6): a scan opens a loan, or ticks a line of the loan already open; check-out sends
// the ticked promised lines with their condition and who is collecting, return the ticked out lines.
import type { DeskLine, DeskLoan } from '../../shared/desk'
import type { Condition, OverrideReason } from '../../shared/states'

export type DeskMode = 'out' | 'back'
export interface LineChoice { on: boolean, condition: Condition, quantity: number | null, lost: boolean, fault: string }

export function useKitDesk() {
  const { t } = useT()
  const { $api } = useNuxtApp()
  const { toRefusal } = useRefusal()
  const toast = useToast()
  const mode = ref<DeskMode>('out')
  const code = ref('')
  const loan = ref<DeskLoan | null>(null)
  const collector = ref<string | undefined>()
  const overrideReason = ref<OverrideReason | undefined>()
  const choices = reactive<Record<string, LineChoice>>({})
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
  const busy = ref(false)

  const waiting = computed(() => (loan.value?.lines ?? []).filter(l => !l.withLineId && l.state === (mode.value === 'out' ? 'promised' : 'out')))
  const ticked = computed(() => waiting.value.filter(l => choices[l.id]?.on))
  const unmet = computed(() => mode.value === 'out' ? ticked.value.filter(l => l.needs.some(n => !n.met)) : [])

  function reset(l: DeskLine): LineChoice {
    return { on: false, condition: l.condition, quantity: l.tracking === 'counted' ? l.quantity - l.returnedQuantity : null, lost: false, fault: '' }
  }
  async function load(id: string) {
    const query = collector.value ? { collector: collector.value } : {}
    loan.value = (await $api<{ loan: DeskLoan }>(`/api/inventory/desk/loans/${id}`, { query })).loan
    for (const l of loan.value.lines) choices[l.id] = choices[l.id] ?? reset(l)
  }

  // A tag or label on the open loan ticks its line; anything else opens the loan it belongs to.
  async function scan() {
    const typed = code.value.trim()
    if (!typed) return
    refusal.value = null
    const line = waiting.value.find(l => l.tag.toLowerCase() === typed.toLowerCase() || typed.endsWith(`/console/inventory/items/${l.itemId}`))
    try {
      if (line) choices[line.id]!.on = true
      else {
        collector.value = undefined
        await load((await $api<{ loanId: string }>('/api/inventory/desk/scan', { query: { code: typed } })).loanId)
      }
      code.value = ''
    }
    catch (e) {
      refusal.value = toRefusal(e)
    }
  }
  watch(collector, () => { if (loan.value) void load(loan.value.id) })

  async function send() {
    if (!loan.value || !ticked.value.length) return
    refusal.value = null
    busy.value = true
    const id = loan.value.id
    try {
      if (mode.value === 'out') {
        await $api(`/api/inventory/desk/loans/${id}/check-out`, { method: 'POST', body: { lines: ticked.value.map(l => ({ lineId: l.id, condition: choices[l.id]!.condition })), collectorAccountId: collector.value ?? null, overrideReason: overrideReason.value ?? null } })
      }
      else {
        await $api(`/api/inventory/desk/loans/${id}/return`, { method: 'POST', body: { lines: ticked.value.map(l => ({ lineId: l.id, ...choices[l.id]!, on: undefined, fault: choices[l.id]!.fault || null })) } })
      }
      toast.add({ title: t(mode.value === 'out' ? 'inventory.desk.checked-out' : 'inventory.desk.returned', { count: ticked.value.length }), color: 'success' })
      for (const l of ticked.value) Object.assign(choices[l.id]!, reset(l))
      overrideReason.value = undefined
      await load(id)
    }
    catch (e) {
      refusal.value = toRefusal(e)
    }
    finally {
      busy.value = false
    }
  }

  return { mode, code, loan, collector, overrideReason, choices, refusal, busy, waiting, ticked, unmet, scan, send }
}
