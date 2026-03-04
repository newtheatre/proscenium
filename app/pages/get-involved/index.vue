<template>
  <div>
    <!-- Hero Section -->
    <UPageHero
      title="Get Involved"
      description="Join England's only fully student-run theatre. Whether you want to spend an evening with us or dedicate the whole week - there's always something to do."
    />

    <UContainer>
      <!-- Main Ways to Get Involved -->
      <div class="mb-16">
        <h2 class="text-3xl font-bold mb-8">
          How to Get Started
        </h2>

        <UPageGrid>
          <UPageCard
            title="Join Our Mailing List"
            description="Stay up to date with all our shows, auditions, and opportunities. This is the best way to never miss out on what's happening."
            icon="i-lucide-mail"
          >
            <template #footer>
              <UButton
                to="/mailing-list"
                color="primary"
                size="lg"
                block
              >
                Subscribe Now
              </UButton>
            </template>
          </UPageCard>

          <UPageCard
            title="Come to Season Launch"
            description="Our season launches are the perfect opportunity to discover all available roles and meet the creative teams for upcoming shows."
            icon="i-lucide-calendar"
          >
            <template #footer>
              <UButton
                to="/whats-on"
                color="secondary"
                size="lg"
                block
              >
                View What's On
              </UButton>
            </template>
          </UPageCard>

          <UPageCard
            title="Follow Our Socials"
            description="Keep up with behind-the-scenes content, announcements, and connect with the NNT community on social media."
            icon="i-lucide-users"
          >
            <template #footer>
              <div class="flex gap-2 justify-center">
                <UButton
                  to="https://facebook.com/thenottinghamnewtheatre"
                  external
                  icon="icon-facebook"
                  color="neutral"
                  variant="outline"
                />
                <UButton
                  to="https://instagram.com/nottinghamnewtheatre"
                  external
                  icon="icon-instagram"
                  color="neutral"
                  variant="outline"
                />
              </div>
            </template>
          </UPageCard>
        </UPageGrid>
      </div>

      <!-- Areas to Get Involved -->
      <div class="mb-16">
        <h2 class="text-3xl font-bold mb-4">
          Areas to Explore
        </h2>
        <p class="text-lg mb-8">
          From performing on stage to working behind the scenes, there are countless ways to contribute to our productions.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <!-- Performance -->
          <UCard>
            <div class="text-center">
              <div class="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <UIcon
                  name="i-lucide-theater"
                  class="w-6 h-6 text-primary"
                />
              </div>
              <h3 class="text-xl font-semibold mb-2">
                Performance
              </h3>
              <p class="text-muted mb-4">
                Acting, directing, producing, and writing for our diverse range of productions.
              </p>
              <UButton
                to="/about"
                variant="outline"
                size="sm"
                block
              >
                Learn More
              </UButton>
            </div>
          </UCard>

          <!-- Technical -->
          <UCard>
            <div class="text-center">
              <div class="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <UIcon
                  name="i-lucide-settings"
                  class="w-6 h-6 text-primary"
                />
              </div>
              <h3 class="text-xl font-semibold mb-2">
                Technical
              </h3>
              <p class="text-muted mb-4">
                Lighting, sound, video design, rigging, and technical direction. Join our Wednesday stagecraft workshop from 4-5pm.
              </p>
              <UButton
                to="/get-involved/stagecraft"
                variant="outline"
                size="sm"
                block
              >
                Learn More
              </UButton>
            </div>
          </UCard>

          <!-- Improv & Performance -->
          <UCard>
            <div class="text-center">
              <div class="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <UIcon
                  name="i-lucide-theater"
                  class="w-6 h-6 text-primary"
                />
              </div>
              <h3 class="text-xl font-semibold mb-2">
                Improv & Performance
              </h3>
              <p class="text-muted mb-4">
                Improvisation, character work, and spontaneous performance. Join our Wednesday improv group from 2-4pm.
              </p>
              <UButton
                to="/get-involved/creatives"
                variant="outline"
                size="sm"
                block
              >
                Learn More
              </UButton>
            </div>
          </UCard>

          <!-- Stage Management -->
          <UCard>
            <div class="text-center">
              <div class="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <UIcon
                  name="i-lucide-clipboard-list"
                  class="w-6 h-6 text-primary"
                />
              </div>
              <h3 class="text-xl font-semibold mb-2">
                Stage Management
              </h3>
              <p class="text-muted mb-4">
                Keep productions running smoothly behind the scenes during rehearsals and performances.
              </p>
              <UButton
                to="/about"
                variant="outline"
                size="sm"
                block
              >
                Learn More
              </UButton>
            </div>
          </UCard>

          <!-- Website & Development -->
          <UCard>
            <div class="text-center">
              <div class="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <UIcon
                  name="i-lucide-code"
                  class="w-6 h-6 text-primary"
                />
              </div>
              <h3 class="text-xl font-semibold mb-2">
                Website & Tech
              </h3>
              <p class="text-muted mb-4">
                Help develop and maintain our website, ticketing system, and digital presence.
              </p>
              <UButton
                to="/about"
                variant="outline"
                size="sm"
                block
              >
                Learn More
              </UButton>
            </div>
          </UCard>

          <!-- Committee & Governance -->
          <UCard>
            <div class="text-center">
              <div class="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <UIcon
                  name="i-lucide-users-2"
                  class="w-6 h-6 text-primary"
                />
              </div>
              <h3 class="text-xl font-semibold mb-2">
                Committee
              </h3>
              <p class="text-muted mb-4">
                Take on leadership roles and help shape the future direction of the theatre.
              </p>
              <UButton
                to="/about"
                variant="outline"
                size="sm"
                block
              >
                Learn More
              </UButton>
            </div>
          </UCard>
        </div>
      </div>

      <!-- Weekly Workshops -->
      <div class="mb-16">
        <h2 class="text-3xl font-bold mb-4">
          Weekly Workshops
        </h2>
        <p class="text-lg text-muted mb-8">
          Join our regular Wednesday workshops to develop your skills and work on current productions. Perfect for beginners and experienced members alike.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <!-- Creatives Workshop -->
          <UCard class="border border-primary/20">
            <div class="p-6">
              <div class="flex items-start gap-4 mb-4">
                <div class="flex items-center justify-center w-12 h-12 rounded-full bg-purple-50 dark:bg-purple-900/20 flex-shrink-0">
                  <UIcon
                    name="i-lucide-theater"
                    class="w-6 h-6 text-purple-600 dark:text-purple-400"
                  />
                </div>
                <div class="flex-1">
                  <h3 class="text-xl font-semibold mb-1">
                    Creatives Improv
                  </h3>
                  <div class="flex items-center gap-2 text-sm text-muted mb-2">
                    <UIcon
                      name="i-lucide-clock"
                      class="w-4 h-4"
                    />
                    <span>Wednesdays, 2:00 PM - 4:00 PM</span>
                  </div>
                </div>
              </div>
              <p class="text-muted mb-4">
                Join our weekly improv group and develop spontaneous performance skills, confidence, and creativity through improvised theatre.
              </p>
              <UButton
                to="/get-involved/creatives"
                color="primary"
                variant="outline"
                block
              >
                Join Creatives
              </UButton>
            </div>
          </UCard>

          <!-- Stagecraft Workshop -->
          <UCard class="border border-primary/20">
            <div class="p-6">
              <div class="flex items-start gap-4 mb-4">
                <div class="flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex-shrink-0">
                  <UIcon
                    name="i-lucide-settings"
                    class="w-6 h-6 text-blue-600 dark:text-blue-400"
                  />
                </div>
                <div class="flex-1">
                  <h3 class="text-xl font-semibold mb-1">
                    Stagecraft
                  </h3>
                  <div class="flex items-center gap-2 text-sm text-muted mb-2">
                    <UIcon
                      name="i-lucide-clock"
                      class="w-4 h-4"
                    />
                    <span>Wednesdays, 4:00 PM - 5:00 PM</span>
                  </div>
                </div>
              </div>
              <p class="text-muted mb-4">
                Master lighting, sound, rigging, and technical direction. Ideal for engineering students and those fascinated by how technical magic happens.
              </p>
              <UButton
                to="/get-involved/stagecraft"
                color="primary"
                variant="outline"
                block
              >
                Join Stagecraft
              </UButton>
            </div>
          </UCard>
        </div>

        <div class="mt-8">
          <UAlert
            color="info"
            variant="soft"
          >
            <template #title>
              No Experience Necessary!
            </template>
            <template #description>
              Both workshops welcome complete beginners. We provide everything, so just turn up and start learning with experienced members guiding you.
            </template>
          </UAlert>
        </div>
      </div>

      <!-- Membership Information -->
      <UPageCTA
        title="Become a Member"
        description="Joining the Nottingham New Theatre as a member gives you access to auditions, workshops, and the chance to get involved in any aspect of our productions. Membership is affordable and open to all students."
        class="mb-16"
        :links="[
          {
            label: 'Join Now',
            to: 'https://su.nottingham.ac.uk/activities/view/new-theatre',
            color: 'primary',
            size: 'xl' as const,
            external: true,
          },
        ]"
      />

      <!-- Contact Section -->
      <UPageCTA
        title="Questions?"
        description="If you have any questions about getting involved or want to know more about specific roles, don't hesitate to get in touch. We're always happy to help!"
      >
        <template #links>
          <UButton
            to="mailto:boxoffice@newtheatre.org.uk"
            external
            color="primary"
            size="lg"
            icon="i-lucide-mail"
          >
            Contact Us
          </UButton>
        </template>
      </UPageCTA>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
useSeoMeta({
  title: 'Get Involved - Nottingham New Theatre',
  description: 'Join England\'s only fully student-run theatre. From acting and directing to technical work and creative roles, there\'s an opportunity for everyone at the NNT.',
  ogTitle: 'Get Involved - Nottingham New Theatre',
  ogDescription: 'Join England\'s only fully student-run theatre. From acting and directing to technical work and creative roles, there\'s an opportunity for everyone at the NNT.',
  ogImage: '/images/banners/get-involved.jpg',
  twitterCard: 'summary_large_image',
})
</script>
