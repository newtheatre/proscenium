<!-- A small titled card for a record page's `aside`: the poster, where a published record stands,
     its checklist. One frame and one heading size, so the cards beside the tabs match each other. -->
<script setup lang="ts">
defineProps<{ title: string }>()
const id = useId()
</script>

<template>
  <section
    :aria-labelledby="id"
    class="space-y-3 rounded-lg border border-default p-4"
  >
    <h2
      :id="id"
      class="text-sm font-semibold text-highlighted"
    >
      {{ title }}
    </h2>
    <slot />
  </section>
</template>
