// The Give page's state (P3, rules D1, D4, D5, K3): the amount from a preset or typed, the fund or the
// campaign the page was opened from, who is giving, then the payment. Starting makes a pending gift and its link; paying goes to the
// provider's card form here, or its own page and back to the thanks page.
export interface GiveCampaign { id: string, slug: string, title: string, open: boolean, fund: { id: string, name: string }, listAmounts: 'none' | 'band' | 'exact', listNames: boolean }
export interface GiveOptions { presets: number[], minMinor: number, maxMinor: number, currency: string, online: boolean, funds: { id: string, name: string, purpose: string | null, isDefault: boolean }[], campaign: GiveCampaign | null }
export interface CardStep { kind: 'client-secret', provider: string, secret: string, publishableKey: string }

export async function useGive() {
  const { t } = useT()
  const { $api } = useNuxtApp()
  const { toRefusal, fieldErrors } = useRefusal()
  const { viewer } = useViewer()
  const route = useRoute()
  const param = (name: string) => typeof route.query[name] === 'string' ? route.query[name] as string : undefined
  const query = computed(() => ({ campaign: param('campaign'), fund: param('fund') }))
  const options = await useAPI<GiveOptions>('/api/fundraising/give/options', { key: 'fundraising:give:options', query })
  const campaign = computed(() => options.data.value?.campaign ?? null)
  const fund = computed(() => campaign.value?.fund ?? options.data.value?.funds.find(f => f.id === form.fundId) ?? options.data.value?.funds.find(f => f.isDefault))
  const purpose = computed(() => options.data.value?.funds.find(f => f.id === fund.value?.id)?.purpose ?? null)
  // K3: the amount may show beside a name only on a campaign that shows amounts.
  const mayShowAmount = computed(() => !!campaign.value?.listNames && campaign.value.listAmounts !== 'none' && !!form.acknowledgeAs.trim())

  const form = reactive({ amountMinor: null as number | null, other: false, fundId: param('fund'), name: '', email: '', acknowledgeAs: '', message: '', showAmount: false })
  const challenge = ref('')
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
  const card = ref<CardStep | null>(null)
  const token = ref('')
  let idempotency = crypto.randomUUID()

  function choose(amount: number | null) {
    form.other = amount === null
    form.amountMinor = amount
  }

  function validate() {
    const o = options.data.value
    const errors: { name: string, message: string }[] = []
    if (!form.amountMinor) errors.push({ name: 'amountMinor', message: t('fundraising.give.amount-needed') })
    else if (o && (form.amountMinor < o.minMinor || form.amountMinor > o.maxMinor)) errors.push({ name: 'amountMinor', message: t('fundraising.give.amount-range') })
    if (!viewer.value.signedIn && !form.email.trim()) errors.push({ name: 'email', message: t('fundraising.give.email-needed') })
    return errors
  }

  async function begin(): Promise<string> {
    if (token.value) return token.value
    const started = await $api<{ token: string }>('/api/fundraising/give', {
      method: 'POST',
      headers: { 'idempotency-key': idempotency, ...(challenge.value ? { 'cf-turnstile-response': challenge.value } : {}) },
      body: {
        amountMinor: form.amountMinor,
        fundId: campaign.value ? undefined : form.fundId,
        campaignId: campaign.value?.id,
        showAmount: mayShowAmount.value && form.showAmount ? true : undefined,
        name: form.name.trim() || undefined,
        email: viewer.value.signedIn ? undefined : form.email.trim(),
        acknowledgeAs: form.acknowledgeAs.trim() || undefined,
        message: form.message.trim() || undefined,
      },
    })
    token.value = started.token
    return started.token
  }

  async function give(setErrors: (errors: { name: string, message: string }[]) => void) {
    refusal.value = null
    try {
      const link = await begin()
      const next = await $api<{ next: { kind: string, url?: string }, settled: boolean }>(`/api/fundraising/give/${link}/pay` as string, { method: 'POST', body: {}, headers: { 'idempotency-key': crypto.randomUUID() } })
      if (next.next.kind === 'client-secret') card.value = next.next as unknown as CardStep
      else if ((next.next.kind === 'redirect' || next.next.kind === 'handoff') && next.next.url) await navigateTo(next.next.url, { external: true })
      else await navigateTo(`/support/thanks/${link}`)
    }
    catch (e) {
      refusal.value = toRefusal(e)
      setErrors(fieldErrors(refusal.value))
      // A gift refused before it began may be tried again with other details.
      if (!token.value) idempotency = crypto.randomUUID()
    }
  }

  return { options, campaign, mayShowAmount, fund, purpose, form, challenge, refusal, card, token, choose, validate, give, signedIn: computed(() => viewer.value.signedIn) }
}
