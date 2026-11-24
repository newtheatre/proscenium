<!-- Your calendar (C-70): the one private feed address with everything you are on, and Reset. -->
<script setup lang="ts">
const { t } = useT()
</script>

<template>
  <PageFrame
    :title="t('calendar-feed.account.title')"
    :description="t('calendar-feed.account.summary')"
    :trail="[{ label: t('core.account.title'), to: '/account' }]"
    width="reading"
  >
    <CalendarFeedPanel />
  </PageFrame>
</template>
