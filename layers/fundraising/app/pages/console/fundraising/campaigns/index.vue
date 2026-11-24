<!-- Campaigns (C5, FR-10): open ones first, then drafts, closed and archived, each with raised
     against its target. New makes a draft; nothing is public until it is published. -->
<script setup lang="ts">
import type { CampaignLine } from '../../../../composables/useCampaignText'

const { t } = useT()
const text = useCampaignText()
const { data, status, error, refresh } = await useAPI<{ campaigns: CampaignLine[], funds: { id: string, name: string }[] }>('/api/fundraising/campaigns', { key: 'fundraising:campaigns' })
const editing = ref<null | undefined>(undefined)
const live = computed(() => (data.value?.campaigns ?? []).filter(c => c.state !== 'archived'))
const archived = computed(() => (data.value?.campaigns ?? []).filter(c => c.state === 'archived'))
const opened = (id: string) => navigateTo(`/console/fundraising/campaigns/${id}`)
</script>

<template>
  <PageFrame :title="t('fundraising.navigation.campaigns.label')">
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('fundraising.campaign.new')"
        @click="editing = null"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.campaigns.length"
        icon="i-lucide-megaphone"
        :title="t('fundraising.campaigns.empty')"
        :description="t('fundraising.campaigns.empty-help')"
      />
      <template v-else>
        <RecordList :label="t('fundraising.navigation.campaigns.label')">
          <RecordListItem
            v-for="c in live"
            :key="c.id"
            :to="`/console/fundraising/campaigns/${c.id}`"
            icon="i-lucide-megaphone"
            :name="c.title"
            :description="`${text.raised(c)} · ${text.dates(c)}`"
          >
            <StatusBadge
              :tone="text.state(c).tone"
              :label="text.state(c).label"
            />
          </RecordListItem>
        </RecordList>
        <CollapsibleDivider
          :label="t('fundraising.campaigns.archived')"
          :count="archived.length"
        >
          <RecordList :label="t('fundraising.campaigns.archived')">
            <RecordListItem
              v-for="c in archived"
              :key="c.id"
              :to="`/console/fundraising/campaigns/${c.id}`"
              icon="i-lucide-archive"
              :name="c.title"
              :description="text.raised(c)"
              muted
            />
          </RecordList>
        </CollapsibleDivider>
      </template>
    </DataBoundary>
    <FundraisingCampaignDialog
      :campaign="editing"
      :funds="data?.funds ?? []"
      @close="editing = undefined"
      @saved="opened"
    />
  </PageFrame>
</template>
