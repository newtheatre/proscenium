<script setup lang="ts">
defineProps<{
  icon: string
  title: string
}>()
</script>

<template>
  <UCard>
    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <UIcon
          :name="icon"
          class="size-5 text-primary"
        />
        <h3 class="font-semibold text-default">
          {{ title }}
        </h3>
      </div>
      <slot />
    </div>
  </UCard>
</template>
