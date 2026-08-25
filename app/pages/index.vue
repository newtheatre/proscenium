<script setup lang="ts">
useSeoMeta({
  title: 'The Nottingham New Theatre - Student-Run Theatre',
  ogTitle: 'The Nottingham New Theatre',
  description: 'A vibrant student-run theatre at the University of Nottingham. Join our community of over 200 students from all courses and disciplines.',
  ogDescription: 'A vibrant student-run theatre at the University of Nottingham. Join our community of over 200 students from all courses and disciplines.',
  ogImage: '/images/nnt_front.jpg',
  twitterCard: 'summary_large_image',
})

const { data: shows, status: showsStatus, refresh: refreshShows } = await useFetch('/api/whats-on', {
  key: 'homepage-whats-on',
  default: () => [],
})

const featuredShows = computed(() => shows.value?.slice(0, 3) ?? [])
const showsLoading = computed(() => showsStatus.value === 'pending')
</script>

<template>
  <div>
    <!-- Hero Section with full-width background -->
    <div class="relative w-full">
      <UPageHero
        title="The Nottingham New Theatre"
        description="England's only fully student-run theatre"
        :links="[
          { label: 'What\'s On', to: '/whats-on', icon: 'i-lucide-ticket', size: 'xl' as const },
          { label: 'Get Involved', to: '/get-involved', variant: 'outline' as const, size: 'xl' as const },
        ]"
        :ui="{
          wrapper: 'relative overflow-hidden py-24 sm:py-32',
          title: 'text-4xl font-bold tracking-tight text-white sm:text-6xl',
          description: 'mt-6 text-lg leading-8 text-white/90',
        }"
      />
      <!-- Background -->
      <div class="absolute inset-0 -z-10">
        <img
          src="/images/nnt_front.jpg"
          alt="Nottingham New Theatre building front"
          class="w-full h-full object-cover"
        >
        <div class="absolute inset-0 bg-black/50" />
      </div>
    </div>

    <!-- Main Content -->
    <div class="py-12">
      <!-- What's On Section -->
      <UContainer>
        <div class="mb-8 flex justify-between items-center">
          <div>
            <h2 class="text-3xl font-bold mb-2">
              What's On
            </h2>
            <p class="text-muted">
              Discover our upcoming productions
            </p>
          </div>
          <UButton
            to="/whats-on"
            color="primary"
            variant="outline"
            size="lg"
          >
            View All Shows
          </UButton>
        </div>

        <!-- Loading State -->
        <div
          v-if="showsLoading"
          class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8"
        >
          <div
            v-for="i in 3"
            :key="i"
            class="border rounded-lg overflow-hidden"
          >
            <USkeleton class="h-48 w-full" />
            <div class="p-4">
              <USkeleton class="h-6 w-3/4 mb-2" />
              <USkeleton class="h-4 w-full mb-2" />
              <USkeleton class="h-4 w-5/6 mb-4" />
              <USkeleton class="h-8 w-24" />
            </div>
          </div>
        </div>

        <!-- Shows Grid -->
        <div
          v-else-if="featuredShows.length > 0"
          class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8"
        >
          <WhatsOnShowCard
            v-for="show in featuredShows"
            :key="show.id"
            :show="show"
          />
        </div>

        <!-- A failed load must not read as "nothing is on sale". -->
        <div
          v-else-if="showsStatus === 'error'"
          class="mb-8"
        >
          <UAlert
            color="error"
            variant="soft"
            icon="i-lucide-triangle-alert"
            title="We could not load the listings"
            description="Something went wrong at our end. Please try again in a moment."
          />
          <UButton
            class="mt-4"
            color="error"
            variant="outline"
            icon="i-lucide-rotate-ccw"
            label="Try again"
            @click="() => refreshShows()"
          />
        </div>

        <!-- No Shows Message -->
        <UAlert
          v-else
          color="info"
          variant="soft"
          title="No Shows Currently Listed"
          description="Check back soon for our upcoming productions!"
          class="mb-8"
        />
      </UContainer>

      <!-- About Section -->
      <UContainer>
        <div class="mb-8">
          <h2 class="text-3xl font-bold mb-4">
            About Us
          </h2>
          <p>
            We are The Nottingham New Theatre, a student-run theatre. As part of the University of Nottingham Student's Union (UoNSU) we have a membership of over 200 students every year. Students join us from a variety of courses and disciplines; from English to Engineering, undergraduate and postgraduate. Whether you're keen to act, direct, work backstage or just watch an amazing show, there's a place for you here!
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-6 mb-8">
          <UCard class="p-6">
            <h3 class="text-xl font-semibold mb-2">
              Inclusive Community
            </h3>
            <p>
              Students from all backgrounds welcome. No experience required!
            </p>
          </UCard>

          <UCard class="p-6">
            <h3 class="text-xl font-semibold mb-2">
              Student-Led
            </h3>
            <p>
              All shows are produced, directed, and performed by students.
            </p>
          </UCard>

          <UCard class="p-6">
            <h3 class="text-xl font-semibold mb-2">
              Year-Round
            </h3>
            <p>
              Multiple productions each term with ongoing opportunities.
            </p>
          </UCard>
        </div>

        <!-- Call to Action -->
        <UPageCTA
          title="Ready to Join Our Theatre Family?"
          description="Whether you're looking to step into the spotlight or work behind the scenes, we'd love to have you as part of our community."
          :links="[
            {
              label: 'Become a Member',
              to: 'https://su.nottingham.ac.uk/activities/view/new-theatre',
              color: 'primary',
              size: 'xl' as const,
              external: true,
            },
            {
              label: 'Contact Us',
              to: 'mailto:boxoffice@newtheatre.org.uk',
              variant: 'outline' as const,
              size: 'xl' as const,
              external: true,
            },
          ]"
          class="mt-20"
        />
      </UContainer>
    </div>
  </div>
</template>
