<template>
  <div>
    <!-- Hero Section -->
    <UPageHero
      title="Creatives Improv"
      description="Join our weekly improv group every Wednesday and discover the joy of spontaneous performance. From comedy to drama, explore the art of improvisation at the NNT."
    />

    <UContainer>
      <!-- What We Do -->
      <div class="mb-16">
        <h2 class="text-3xl font-bold mb-8">
          What We Do
        </h2>

        <UPageGrid>
          <UPageCard
            title="Improvisational Theatre"
            description="Develop your ability to create characters, scenes, and stories on the spot. Learn the fundamentals of spontaneous performance."
            icon="i-lucide-theater"
          />

          <UPageCard
            title="Comedy & Drama"
            description="Explore both comedic and dramatic improvisation techniques. From quick-wit comedy to emotional dramatic scenes."
            icon="i-lucide-laugh"
          />

          <UPageCard
            title="Character Development"
            description="Learn to quickly create and inhabit diverse characters. Develop voices, physicality, and personality on the fly."
            icon="i-lucide-user"
          />

          <UPageCard
            title="Scene Work"
            description="Master the fundamentals of improvised scene construction. Learn to build compelling stories collaboratively."
            icon="i-lucide-play"
          />

          <UPageCard
            title="Team Building"
            description="Build trust and collaboration skills through ensemble work. Learn to support your fellow performers."
            icon="i-lucide-users"
          />

          <UPageCard
            title="Performance Skills"
            description="Develop confidence, stage presence, and quick thinking. Skills that benefit performers and non-performers alike."
            icon="i-lucide-zap"
          />
        </UPageGrid>
      </div>

      <!-- Improv Experience -->
      <div class="mb-16">
        <h2 class="text-3xl font-bold mb-4">
          Improv Experience
        </h2>
        <p class="text-lg text-muted mb-8">
          Every session is unique! We combine warm-up exercises, skill-building games, and longer improvised scenes. You'll create spontaneous theatre that's different every week.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <UCard>
            <div class="text-center p-6">
              <div class="mx-auto mb-4 w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                <UIcon
                  name="i-lucide-heart"
                  class="w-8 h-8 text-blue-600 dark:text-blue-400"
                />
              </div>
              <h3 class="text-xl font-semibold mb-2">
                Supportive Environment
              </h3>
              <p class="text-muted">
                Learn in a safe, encouraging space where "yes, and..." is the golden rule. Everyone supports each other's creative choices.
              </p>
            </div>
          </UCard>

          <UCard>
            <div class="text-center p-6">
              <div class="mx-auto mb-4 w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                <UIcon
                  name="i-lucide-sparkles"
                  class="w-8 h-8 text-green-600 dark:text-green-400"
                />
              </div>
              <h3 class="text-xl font-semibold mb-2">
                Spontaneous Creativity
              </h3>
              <p class="text-muted">
                Discover the joy of creating something from nothing. Every scene is unique and emerges from the collective imagination of the group.
              </p>
            </div>
          </UCard>
        </div>
      </div>

      <!-- Skills You'll Learn -->
      <div class="mb-16">
        <h2 class="text-3xl font-bold mb-8">
          Skills You'll Develop
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="space-y-4">
            <h3 class="text-lg font-semibold flex items-center gap-2">
              <UIcon
                name="i-lucide-mic"
                class="w-5 h-5 text-primary"
              />
              Performance Skills
            </h3>
            <ul class="space-y-2 text-muted">
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Stage presence and confidence
              </li>
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Voice and physical expression
              </li>
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Character creation and embodiment
              </li>
            </ul>
          </div>

          <div class="space-y-4">
            <h3 class="text-lg font-semibold flex items-center gap-2">
              <UIcon
                name="i-lucide-brain"
                class="w-5 h-5 text-primary"
              />
              Creative Thinking
            </h3>
            <ul class="space-y-2 text-muted">
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Quick thinking and adaptability
              </li>
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Spontaneous storytelling
              </li>
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Creative problem-solving
              </li>
            </ul>
          </div>

          <div class="space-y-4">
            <h3 class="text-lg font-semibold flex items-center gap-2">
              <UIcon
                name="i-lucide-users-2"
                class="w-5 h-5 text-primary"
              />
              Collaboration Skills
            </h3>
            <ul class="space-y-2 text-muted">
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Active listening and response
              </li>
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Ensemble building
              </li>
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Trust and vulnerability
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Call to Action -->
      <UPageCTA
        title="Ready to Join the Fun?"
        description="Come along this Wednesday and discover the joy of spontaneous performance. No experience necessary - just bring your enthusiasm and willingness to play!"
      >
        <template #links>
          <UButton
            to="https://instagram.com/nottinghamnewtheatre"
            variant="outline"
            size="xl"
            icon="i-lucide-instagram"
            external
          >
            Follow Us on Instagram
          </UButton>
          <UButton
            to="mailto:creatives@newtheatre.org.uk"
            variant="solid"
            size="xl"
            icon="i-lucide-help-circle"
            external
          >
            Have Questions?
          </UButton>
        </template>
      </UPageCTA>
    </UContainer>
  </div>
</template>

<script setup>
useSeoMeta({
  title: 'Creatives Improv - Nottingham New Theatre',
  description: 'Join our weekly improv group every Wednesday from 2-4pm. Develop spontaneous performance skills, confidence, and creativity at England\'s only fully student-run theatre.',
  ogTitle: 'Creatives Improv - Nottingham New Theatre',
  ogDescription: 'Join our weekly improv group every Wednesday from 2-4pm. Develop spontaneous performance skills, confidence, and creativity at England\'s only fully student-run theatre.',
  twitterCard: 'summary_large_image',
})
</script>
