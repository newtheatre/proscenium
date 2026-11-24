<!-- A claim's decision log: who did what and when, with any note the claimant was sent. -->
<script setup lang="ts">
import type { ClaimEvent } from '../composables/useClaim'

defineProps<{ events: ClaimEvent[], currency: string }>()
const { t } = useT()
const { dateTime } = useDates()
const text = useBudgetText()
</script>

<template>
  <RecordList :label="t('budgets.screens.claims.log')">
    <RecordListItem
      v-for="(e, i) in events"
      :key="i"
      icon="i-lucide-history"
      :name="t(`budgets.screens.claim-actions.${e.action}`)"
      :description="[dateTime(e.at), e.byName, e.amountMinor ? text.money(e.amountMinor, currency) : null, e.note].filter(Boolean).join(' · ')"
    />
  </RecordList>
</template>
