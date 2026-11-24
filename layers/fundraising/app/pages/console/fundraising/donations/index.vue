<!-- Donations (C2, FR-17): gifts received, newest first, searched by reference or donor and filtered
     by fund. Gifts still being paid for, or never paid, are a choice of their own. -->
<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import type { DonationLine } from '../../../../composables/useDonationText'

const { t } = useT()
const query = ref('')
const searching = ref(false)
const fundId = ref<string | undefined>(undefined)
const state = ref<string | undefined>(undefined)
const debounced = refDebounced(query, 300) // not-policy: a pause in typing
const params = computed(() => ({ q: debounced.value || undefined, fundId: fundId.value, state: state.value }))
const { data, status, error, refresh } = await useAPI<{ donations: DonationLine[] }>('/api/fundraising/donations', { key: 'fundraising:donations', query: params })
const { data: funds } = await useAPI<{ funds: { id: string, name: string }[] }>('/api/fundraising/give/options', { key: 'fundraising:donations:funds' })
const fundItems = computed(() => (funds.value?.funds ?? []).map(f => ({ value: f.id, label: f.name })))
const stateItems = computed(() => ['pending', 'abandoned', 'refunded'].map(s => ({ value: s, label: t(`fundraising.states.${s}`) })))
</script>

<template>
  <PageFrame :title="t('fundraising.navigation.donations.label')">
    <template #primary>
      <SearchToggle
        v-model="query"
        v-model:open="searching"
        :label="t('fundraising.donations.search')"
      />
    </template>
    <div class="mb-4 flex flex-wrap gap-2">
      <USelect
        v-model="fundId"
        :items="fundItems"
        :placeholder="t('fundraising.donations.any-fund')"
        :aria-label="t('fundraising.donations.fund-filter')"
        class="w-48"
      />
      <USelect
        v-model="state"
        :items="stateItems"
        :placeholder="t('fundraising.donations.received-only')"
        :aria-label="t('fundraising.donations.state-filter')"
        class="w-48"
      />
      <UButton
        v-if="fundId || state"
        :label="t('fundraising.donations.clear')"
        color="neutral"
        variant="link"
        @click="fundId = undefined; state = undefined"
      />
    </div>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.donations.length"
        icon="i-lucide-hand-heart"
        :title="t('fundraising.donations.empty')"
        :description="t('fundraising.donations.empty-help')"
      />
      <FundraisingDonationList
        v-else
        :donations="data.donations"
        :label="t('fundraising.navigation.donations.label')"
      />
    </DataBoundary>
  </PageFrame>
</template>
