<!-- Booking over the show's page (concept A, "Spotlight"): Choose tickets and then Check and pay in a
     drawer from the side, so the show stays in view. Both steps are the pages' own components, so ID
     boxes, passes and the countdown work exactly as on the pages. Global, as the public pages open it
     by the name in core.booking-action's `drawer`, given the performance's booking link. -->
<script setup lang="ts">
const props = defineProps<{ link: string, title: string, when: string }>()
const open = defineModel<boolean>('open', { default: false })

// The link is this module's own (/book/<production>/<performance>); its last part is the performance.
const performanceId = computed(() => props.link.split('?')[0]!.split('/').filter(Boolean).at(-1) ?? '')
// Each opening starts at Choose tickets, which offers to carry on with seats already held.
const opened = ref(0)
watch(open, (value) => {
  if (value) opened.value++
})
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="title"
    :description="when"
    :ui="{ content: 'sm:max-w-lg', body: 'sm:p-6' }"
  >
    <template #body>
      <BoxOfficeBookingSteps
        :key="opened"
        :performance-id="performanceId"
      />
    </template>
  </USlideover>
</template>
