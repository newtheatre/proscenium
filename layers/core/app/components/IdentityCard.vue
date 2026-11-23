<!-- The narrow card the sign-in, setup and passkey screens sit in. Its title is the page's one heading. -->
<script setup lang="ts">
defineProps<{ title: string, description?: string }>()
</script>

<template>
  <UContainer class="flex justify-center py-6 sm:py-12">
    <UPageCard
      :title="title"
      :description="description"
      class="w-full max-w-md"
    >
      <template #title>
        <h1 class="text-xl font-semibold text-highlighted">
          {{ title }}
        </h1>
      </template>
      <div class="flex flex-col gap-4">
        <slot />
      </div>
    </UPageCard>
  </UContainer>
</template>
