<!-- The bordered list used wherever a page lists a record's parts (a venue's spaces, a vocabulary's
     terms, search results). Rows are RecordListItem. -->
<script setup lang="ts">
defineProps<{ label?: string }>()
</script>

<template>
  <ul
    class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default"
    :aria-label="label"
  >
    <slot />
  </ul>
</template>
