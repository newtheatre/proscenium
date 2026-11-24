<!-- Gifts as rows: who gave and how much, opening each gift's page; a gift not received says so. -->
<script setup lang="ts">
import type { DonationLine } from '../composables/useDonationText'

defineProps<{ donations: DonationLine[], label: string }>()
const text = useDonationText()
</script>

<template>
  <RecordList :label="label">
    <RecordListItem
      v-for="d in donations"
      :key="d.id"
      :to="`/console/fundraising/donations/${d.id}`"
      icon="i-lucide-hand-heart"
      :name="text.name(d)"
      :description="text.line(d)"
    >
      <StatusBadge
        v-if="d.state !== 'received'"
        :tone="text.state(d).tone"
        :label="text.state(d).label"
      />
    </RecordListItem>
  </RecordList>
</template>
