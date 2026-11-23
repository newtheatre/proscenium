<!-- The bordered list used wherever a page lists a record's parts (a venue's spaces, a vocabulary's
     terms, search results). Rows are RecordListItem. -->
<script setup lang="ts">
defineProps<{ label?: string, /** No frame of its own, for a list that fills a PageSection: the card is the frame. */ flush?: boolean }>()
</script>

<template>
  <ul
    class="divide-y divide-default"
    :class="flush ? '-mx-4 -my-4 sm:-mx-6 sm:-my-6' : 'overflow-hidden rounded-lg border border-default bg-default'"
    :aria-label="label"
  >
    <slot />
  </ul>
</template>
