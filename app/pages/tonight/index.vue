<script setup lang="ts">
definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Tonight' })

// The hub holds no data of its own yet, so what it syncs is the clock it was opened at. Show
// night owns this screen's content from E-112; this is the shell exercising its primitives.
const syncedAt = ref<Date | null>(null)
onMounted(() => {
  syncedAt.value = new Date()
})
</script>

<template>
  <NightScreen
    title="Tonight"
    hint="Nothing is on tonight yet. The door, the till and the registers arrive in Phase 2."
    :stale="syncedAt"
  >
    <p class="text-muted">
      When a performance is on, this is where the night's screens are listed.
    </p>

    <template #actions>
      <NightAction
        label="Refresh"
        icon="i-lucide-refresh-cw"
        color="neutral"
        @press="syncedAt = new Date()"
      />
    </template>
  </NightScreen>
</template>
