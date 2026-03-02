<script setup lang="ts">
useSeoMeta({
  title: 'What\'s On',
  description: 'See what shows are currently on and book your tickets at the Nottingham New Theatre.',
})

const { data: shows, status } = await useFetch('/api/whats-on', {
  key: 'whats-on',
  default: () => [],
})
</script>

<template>
  <UContainer class="py-8 lg:py-12">
    <UPageHeader
      title="What's On"
      description="Discover our upcoming shows and book your tickets."
    />

    <!-- Loading state -->
    <div
      v-if="status === 'pending'"
      class="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      <div
        v-for="i in 6"
        :key="i"
      >
        <UCard :ui="{ body: 'p-0' }">
          <template #header>
            <USkeleton class="aspect-3/4 w-full" />
          </template>
          <div class="p-4 space-y-3">
            <USkeleton class="h-6 w-3/4" />
            <USkeleton class="h-4 w-1/2" />
            <USkeleton class="h-4 w-2/3" />
          </div>
        </UCard>
      </div>
    </div>

    <!-- Shows grid -->
    <div
      v-else-if="shows && shows.length > 0"
      class="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      <WhatsOnShowCard
        v-for="show in shows"
        :key="show.id"
        :show="show"
      />
    </div>

    <!-- Empty state -->
    <div
      v-else
      class="mt-12"
    >
      <UEmpty
        icon="i-lucide-theater"
        title="No shows currently on sale"
        description="We don't have any shows on sale right now. Check back soon for new performances!"
      />
    </div>
  </UContainer>
</template>
