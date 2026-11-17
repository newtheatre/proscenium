<script setup lang="ts">
definePageMeta({ layout: 'console' })
// A sample chart, so the browser tests can check one in both colour modes.
const weeks = [
  { week: '2 Nov', written: 4, sent: 2 },
  { week: '9 Nov', written: 6, sent: 5 },
  { week: '16 Nov', written: 3, sent: 3 },
]
</script>

<template>
  <PageFrame title="Sample drafts">
    <div class="space-y-6">
      <p>Three drafts are waiting.</p>
      <ChartFigure
        title="Drafts written and sent"
        summary="Thirteen drafts written and ten sent over three weeks."
        :data="weeks"
        index="week"
        :categories="[{ key: 'written', label: 'Written' }, { key: 'sent', label: 'Sent' }]"
      />
    </div>
  </PageFrame>
</template>
