<!-- The narrow card the sign-in, setup and passkey screens sit in, until the interface workstream's shells land. -->
<script setup lang="ts">
defineProps<{ title: string, description?: string }>()
</script>

<template>
  <UContainer class="flex justify-center py-12">
    <UPageCard
      :title="title"
      :description="description"
      class="w-full max-w-md"
    >
      <div class="flex flex-col gap-4">
        <slot />
      </div>
    </UPageCard>
  </UContainer>
</template>
