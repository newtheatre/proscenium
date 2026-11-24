<!-- A campaign's gifts, newest first (C6's gifts tab). Reading them is audited, as on Donations. -->
<script setup lang="ts">
import type { DonationLine } from '../composables/useDonationText'

const props = defineProps<{ campaignId: string }>()
const { t } = useT()
const { data, status, error, refresh } = await useAPI<{ donations: DonationLine[] }>('/api/fundraising/donations', { key: `fundraising:campaign-gifts:${props.campaignId}`, query: { campaignId: props.campaignId } })
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <EmptyState
      v-if="!data?.donations.length"
      icon="i-lucide-hand-heart"
      :title="t('fundraising.campaign.no-gifts')"
    />
    <FundraisingDonationList
      v-else
      :donations="data.donations"
      :label="t('fundraising.campaign.gifts')"
    />
  </DataBoundary>
</template>
