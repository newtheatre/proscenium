<script setup lang="ts">
useSeoMeta({
  title: 'Nottingham New Theatre',
  description: 'Student theatre at the University of Nottingham. See what\'s on and book your tickets.',
})

const { data: shows } = await useFetch('/api/whats-on', {
  key: 'homepage-whats-on',
  default: () => [],
})

const featuredShows = computed(() => shows.value?.slice(0, 3) ?? [])
</script>

<template>
  <div>
    <!-- Hero -->
    <UPageHero
      title="Nottingham New Theatre"
      description="Student-run theatre at the University of Nottingham. See our upcoming shows and book your tickets."
      :links="[
        { label: 'What\'s On', to: '/whats-on', icon: 'i-lucide-ticket', size: 'lg' as const },
        { label: 'Get Involved', to: '/get-involved', color: 'neutral' as const, variant: 'subtle' as const, size: 'lg' as const },
      ]"
    />

    <!-- Featured Shows -->
    <UContainer
      v-if="featuredShows.length > 0"
      class="py-12"
    >
      <div class="flex items-center justify-between mb-8">
        <div>
          <h2 class="text-2xl font-bold text-default">
            What's On
          </h2>
          <p class="text-muted mt-1">
            Our upcoming shows — book your tickets now.
          </p>
        </div>
        <UButton
          label="See All Shows"
          trailing-icon="i-lucide-arrow-right"
          variant="ghost"
          color="neutral"
          to="/whats-on"
        />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <WhatsOnShowCard
          v-for="show in featuredShows"
          :key="show.id"
          :show="show"
        />
      </div>
    </UContainer>

    <!-- CTA -->
    <UPageCTA
      title="Get Involved"
      description="Whether you want to act, direct, design, or crew, there's a place for you at the New Theatre."
      :links="[
        { label: 'Find Out More', to: '/get-involved', color: 'neutral' as const },
      ]"
    />
  </div>
</template>
