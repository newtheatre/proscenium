<!-- A campaign's page as the public reads it (C6's page tab): progress, summary and text, and in
     words what the page shows. A published draft says when it opens. -->
<script setup lang="ts">
import type { Campaign } from '../composables/useCampaignText'

defineProps<{ campaign: Campaign, refusal: ReturnType<ReturnType<typeof useRefusal>['toRefusal']> | null }>()
const { t } = useT()
const { dateTime } = useDates()
const text = useCampaignText()
</script>

<template>
  <div class="space-y-6">
    <RefusalNotice :refusal="refusal" />
    <UAlert
      v-if="campaign.state === 'draft' && campaign.publishedAt"
      color="info"
      variant="subtle"
      icon="i-lucide-calendar-clock"
      :title="t('fundraising.campaign.scheduled', { at: dateTime(campaign.opensAt) })"
    />
    <PageSection :title="t('fundraising.campaign.progress')">
      <FundraisingProgress :progress="campaign" />
      <p
        v-if="campaign.offsetMinor"
        class="mt-2 text-sm text-muted"
      >
        {{ t('fundraising.campaign.offset-included', { note: campaign.offsetNote ?? '' }) }}
      </p>
    </PageSection>
    <PageSection :title="t('fundraising.campaign.summary')">
      <p>{{ campaign.summary }}</p>
      <MarkdownText
        v-if="campaign.body"
        class="mt-4"
        :text="campaign.body"
      />
    </PageSection>
    <PageSection :title="t('fundraising.campaign.shows')">
      <ul class="list-disc space-y-1 ps-5">
        <li>{{ t(campaign.showTotal ? 'fundraising.campaign.shows-total' : 'fundraising.campaign.hides-total') }}</li>
        <li>{{ t(campaign.listNames ? `fundraising.campaign.shows-names.${campaign.listAmounts}` : 'fundraising.campaign.hides-names') }}</li>
        <li>{{ text.dates(campaign) }}</li>
      </ul>
    </PageSection>
  </div>
</template>
