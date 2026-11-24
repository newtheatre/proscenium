<!-- Short billing lines other modules add to a production's page (C-75), such as "By arrangement with",
     drawn as plain text in their placement and order. -->
<script setup lang="ts">
type Placement = 'under-title' | 'credits' | 'footer'
const props = defineProps<{ lines: { text: string, placement: Placement }[], placement: Placement }>()
const here = computed(() => props.lines.filter(l => l.placement === props.placement))
</script>

<template>
  <p
    v-for="(line, i) in here"
    :key="i"
    class="text-sm text-muted"
  >
    {{ line.text }}
  </p>
</template>
