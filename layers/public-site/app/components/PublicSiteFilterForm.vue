<!-- A public list's filters as a plain GET form, so they work with scripts off (C-38). Nothing is
     validated: every value is a choice the page offered, and an unknown one only matches nothing. -->
<script setup lang="ts">
defineProps<{ action: string, label: string }>()
</script>

<template>
  <form
    :action="action"
    method="get"
    novalidate
    role="search"
    :aria-label="label"
  >
    <slot />
  </form>
</template>
