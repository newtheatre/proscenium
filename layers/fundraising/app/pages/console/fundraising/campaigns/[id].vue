<!-- Campaign (C6, FR-10 to FR-12): its state with the next step (publish, close or reopen), raised
     against target, its page as the public will read it, and the gifts it has received. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Campaign } from '../../../../composables/useCampaignText'

const { t } = useT()
const text = useCampaignText()
const { money } = useMoneyText()
const { dateTime } = useDates()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<{ campaign: Campaign, canViewGifts: boolean }>(() => `/api/fundraising/campaigns/${id.value}`, { key: `fundraising:campaign:${id.value}` })
const { data: lists } = await useAPI<{ funds: { id: string, name: string }[] }>('/api/fundraising/campaigns', { key: 'fundraising:campaigns' })
const c = computed(() => data.value?.campaign)
const editing = ref<Campaign | undefined>(undefined)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

type Step = 'publish' | 'close' | 'reopen' | 'archive' | 'restore'
async function move(step: Step) {
  refusal.value = null
  try {
    await $api(`/api/fundraising/campaigns/${id.value}` as string, { method: 'PATCH', body: { step } })
    toast.add({ title: t(`fundraising.campaign.moved.${step}`), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const NEXT: Partial<Record<Campaign['state'], Step>> = { draft: 'publish', open: 'close', closed: 'reopen', archived: 'restore' }
const primary = computed(() => {
  const step = c.value && !(c.value.state === 'draft' && c.value.publishedAt) ? NEXT[c.value.state] : undefined
  return step ? { label: t(`fundraising.campaign.step.${step}`), step } : undefined
})
const actions = computed<DropdownMenuItem[][]>(() => {
  if (!c.value) return []
  const groups: DropdownMenuItem[][] = []
  if (c.value.state !== 'archived') groups.push([{ label: t('fundraising.campaign.edit'), icon: 'i-lucide-pencil', onSelect: () => { editing.value = c.value } }])
  if (c.value.state === 'open' || c.value.state === 'closed') groups.push([{ label: t('fundraising.campaign.view-page'), icon: 'i-lucide-external-link', to: `/support/${c.value.slug}`, target: '_blank' }])
  if (c.value.state === 'closed' || c.value.state === 'draft') groups.push([{ label: t('fundraising.campaign.step.archive'), icon: 'i-lucide-archive', onSelect: () => { void move('archive') } }])
  return groups
})
const summary = computed(() => c.value
  ? [
      { label: t('fundraising.campaign.raised-label'), value: money(c.value.raisedMinor, c.value.currency) },
      { label: t('fundraising.campaign.target'), value: c.value.targetMinor ? money(c.value.targetMinor, c.value.currency) : t('fundraising.campaign.no-target') },
      { label: t('fundraising.campaign.fund'), value: c.value.fund },
      { label: t('fundraising.campaign.opens'), value: dateTime(c.value.opensAt) },
      { label: t('fundraising.campaign.closes'), value: c.value.closesAt ? dateTime(c.value.closesAt) : t('fundraising.campaign.no-close') },
    ]
  : [])
const tabs = computed(() => [{ id: 'page', label: t('fundraising.campaign.page') }, ...(data.value?.canViewGifts ? [{ id: 'gifts', label: t('fundraising.campaign.gifts') }] : [])])
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <PageRecord
      v-if="c"
      :title="c.title"
      :status="text.state(c)"
      :primary="primary"
      :actions="actions"
      :summary="summary"
      record-type="fundraising.campaign"
      :record-id="c.id"
      :tabs="tabs"
      :trail="[{ label: t('fundraising.navigation.campaigns.label'), to: '/console/fundraising/campaigns' }]"
      @primary="primary && move(primary.step)"
    >
      <template #tab-page>
        <FundraisingCampaignPage
          :campaign="c"
          :refusal="refusal"
        />
      </template>
      <template #tab-gifts>
        <FundraisingCampaignGifts :campaign-id="c.id" />
      </template>
    </PageRecord>
    <FundraisingCampaignDialog
      :campaign="editing"
      :funds="lists?.funds ?? []"
      @close="editing = undefined"
      @saved="refresh()"
    />
  </DataBoundary>
</template>
