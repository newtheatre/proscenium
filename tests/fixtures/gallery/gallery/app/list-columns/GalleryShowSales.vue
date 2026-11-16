<!-- A column another module adds to the sample shows list: one request for the page, shared by every cell. -->
<script setup lang="ts">
const props = defineProps<{ listId: string, query: Record<string, unknown>, rowId: string }>()
const { data } = await useAPI<{ sold: Record<string, number> }>('/api/gallery/shows-sales', { query: { ...props.query, list: props.listId }, key: `gallery:sales:${JSON.stringify(props.query)}`, watch: false })
</script>

<template>
  <span data-testid="show-sales">{{ data?.sold[rowId] ?? 0 }} sold</span>
</template>
