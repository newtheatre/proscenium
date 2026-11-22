<!-- An award type's old address: it is now a window over the list of award types. -->
<script setup lang="ts">
const route = useRoute()
await navigateTo({ path: '/admin/modules/awards/types', query: { type: String(route.params.id) } }, { replace: true })
</script>

<template>
  <div />
</template>
