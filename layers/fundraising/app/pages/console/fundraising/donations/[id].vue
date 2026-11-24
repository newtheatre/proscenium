<!-- Donation (C3, FR-17): one gift. Its amount, fund and how it came, who gave it and what they
     asked to be called, and their note to the theatre, which is never shown publicly. -->
<script setup lang="ts">
import type { DonationLine } from '../../../../composables/useDonationText'

interface Donation extends DonationLine { fundId: string, accountId: string | null, email: string | null, acknowledgeAs: string | null, message: string | null, intentId: string | null, createdAt: number }

const { t } = useT()
const text = useDonationText()
const { dayLong } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<{ donation: Donation }>(() => `/api/fundraising/donations/${id.value}`, { key: `fundraising:donation:${id.value}` })
const gift = computed(() => data.value?.donation)
</script>

<template>
  <PageFrame
    :title="gift ? text.name(gift) : t('fundraising.navigation.donations.label')"
    width="reading"
  >
    <template
      v-if="gift"
      #status
    >
      <StatusBadge
        :tone="text.state(gift).tone"
        :label="text.state(gift).label"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="gift"
        class="space-y-6"
      >
        <FactStrip
          :facts="[
            { label: t('fundraising.donation.amount'), value: text.money(gift.amountMinor, gift.currency) },
            { label: t('fundraising.donation.fund'), value: gift.fund, strong: false },
            { label: t('fundraising.donation.received'), value: gift.receivedOn ? dayLong(gift.receivedOn) : t('fundraising.donation.not-received'), strong: false },
          ]"
        />
        <PageSection :title="t('fundraising.donation.details')">
          <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-[12rem_1fr]">
            <dt class="text-muted">
              {{ t('fundraising.donation.channel') }}
            </dt>
            <dd>{{ t(`fundraising.channels.${gift.channel}`) }}</dd>
            <dt class="text-muted">
              {{ t('fundraising.donation.donor') }}
            </dt>
            <dd>{{ gift.donor ?? t('fundraising.donation.anonymous') }}</dd>
            <template v-if="gift.email">
              <dt class="text-muted">
                {{ t('fundraising.donation.email') }}
              </dt>
              <dd>{{ gift.email }}</dd>
            </template>
            <dt class="text-muted">
              {{ t('fundraising.donation.acknowledge') }}
            </dt>
            <dd>{{ gift.acknowledgeAs ?? t('fundraising.donation.anonymous') }}</dd>
            <template v-if="gift.refundedMinor">
              <dt class="text-muted">
                {{ t('fundraising.donation.refunded') }}
              </dt>
              <dd>{{ text.money(gift.refundedMinor, gift.currency) }}</dd>
            </template>
          </dl>
        </PageSection>
        <PageSection
          v-if="gift.message"
          :title="t('fundraising.donation.message')"
          :description="t('fundraising.donation.message-help')"
        >
          <p class="whitespace-pre-line">
            {{ gift.message }}
          </p>
        </PageSection>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
