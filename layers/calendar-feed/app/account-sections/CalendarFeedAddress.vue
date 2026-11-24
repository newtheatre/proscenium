<!-- "Your calendar" as a card on the members' side of My account (C-70): the way to the private feed address. -->
<script setup lang="ts">
const props = defineProps<{ headingId: string }>()
const { t } = useT()
</script>

<template>
  <AccountCard
    :heading-id="props.headingId"
    :title="t('calendar-feed.account.title')"
    :description="t('calendar-feed.account.summary')"
    to="/account/calendar"
    icon="i-lucide-calendar-sync"
  />
</template>
