<template>
  <div>
    <UPageHero
      title="Stagecraft"
      description="Master the technical arts that bring theatrical productions to life. Learn lighting, sound, rigging, and stage management from experienced technicians using professional equipment."
    />

    <UContainer>
      <!-- Sessions -->
      <div class="mb-16">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <h2 class="text-3xl font-bold">
            Workshop Sessions
          </h2>

          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <!-- Category Filter -->
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-filter"
                class="w-4 h-4 text-muted"
              />
              <USelectMenu
                v-model="selectedCategory"
                :items="availableCategories"
                placeholder="Filter by category"
                class="w-48"
              />
            </div>

            <!-- Toggle for upcoming/previous -->
            <div class="flex items-center gap-2">
              <UButton
                :variant="showUpcoming ? 'solid' : 'outline'"
                @click="() => { showUpcoming = true; selectedCategory = 'All Categories' }"
              >
                Upcoming
              </UButton>
              <UButton
                :variant="!showUpcoming ? 'solid' : 'outline'"
                @click="() => { showUpcoming = false; selectedCategory = 'All Categories' }"
              >
                Previous
              </UButton>
            </div>
          </div>
        </div>

        <!-- Sessions List -->
        <div v-if="displayedSessions && displayedSessions.length > 0">
          <!-- Filter Summary -->
          <div
            v-if="selectedCategory !== 'All Categories' || filteredSessions.length !== displayedSessions.length"
            class="mb-6 flex flex-wrap items-center gap-2"
          >
            <span class="text-sm text-muted">
              Showing {{ filteredSessions.length }} session{{ filteredSessions.length !== 1 ? 's' : '' }}
            </span>
            <UBadge
              v-if="selectedCategory !== 'All Categories'"
              variant="subtle"
              color="primary"
              class="flex items-center gap-1"
            >
              <UIcon
                name="i-lucide-tag"
                class="w-3 h-3"
              />
              {{ selectedCategory }}
              <UButton
                variant="link"
                size="2xs"
                class="p-0 h-auto ml-1"
                @click="selectedCategory = 'All Categories'"
              >
                <UIcon
                  name="i-lucide-x"
                  class="w-3 h-3"
                />
              </UButton>
            </UBadge>
          </div>

          <div class="space-y-6">
            <UCard
              v-for="session in displayedSessions"
              :key="session.path"
              class="cursor-pointer hover:shadow-lg transition-shadow"
              @click="openSessionModal(session)"
            >
              <div class="flex flex-col gap-4">
                <div class="flex items-center justify-between">
                  <h3 class="text-lg font-semibold">
                    {{ session.title }}
                  </h3>
                  <UBadge
                    :color="getSessionStatusColor(session)"
                    variant="subtle"
                    size="xs"
                  >
                    {{ getSessionStatus(session) }}
                  </UBadge>
                </div>

                <p>{{ session.description }}</p>

                <!-- Date and metadata -->
                <div class="flex flex-wrap items-center gap-4 text-sm text-muted">
                  <div class="flex items-center gap-1">
                    <UIcon
                      name="i-lucide-calendar"
                      class="w-4 h-4"
                    />
                    {{ formatDate(session.date) }}
                  </div>
                  <div
                    v-if="session.time?.start"
                    class="flex items-center gap-1"
                  >
                    <UIcon
                      name="i-lucide-clock"
                      class="w-4 h-4"
                    />
                    {{ formatSessionTime(session) }}
                  </div>
                  <div
                    v-if="session.location"
                    class="flex items-center gap-1"
                  >
                    <UIcon
                      name="i-lucide-map-pin"
                      class="w-4 h-4"
                    />
                    {{ session.location }}
                  </div>
                  <div
                    v-if="session.category"
                    class="flex items-center gap-1"
                  >
                    <UIcon
                      name="i-lucide-tag"
                      class="w-4 h-4"
                    />
                    {{ session.category }}
                  </div>
                  <div
                    v-if="session.leaders && session.leaders.length > 0"
                    class="flex items-center gap-1"
                  >
                    <UIcon
                      name="i-lucide-users"
                      class="w-4 h-4"
                    />
                    {{ session.leaders.join(', ') }}
                  </div>
                </div>

                <!-- Learning outcomes preview -->
                <div
                  v-if="session.learning_outcomes && session.learning_outcomes.length > 0"
                  class="mt-3"
                >
                  <p class="text-sm font-medium mb-2">
                    What you'll learn:
                  </p>
                  <ul class="space-y-1">
                    <li
                      v-for="outcome in session.learning_outcomes.slice(0, 3)"
                      :key="outcome"
                      class="flex items-start gap-2 text-sm text-muted"
                    >
                      <UIcon
                        name="i-lucide-check"
                        class="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0"
                      />
                      <span class="flex-1">{{ outcome }}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Show More Button -->
          <div
            v-if="filteredSessions.length > 3"
            class="flex justify-center mt-8"
          >
            <UButton
              v-if="!showAllSessions"
              variant="outline"
              @click="showAllSessions = true"
            >
              Show {{ filteredSessions.length - 3 }} More Sessions
            </UButton>
            <UButton
              v-else
              variant="outline"
              @click="showAllSessions = false"
            >
              Show Less
            </UButton>
          </div>
        </div>

        <div
          v-else
          class="text-center py-12"
        >
          <UIcon
            name="i-lucide-calendar-x"
            class="w-12 h-12 text-muted mx-auto mb-4"
          />
          <div class="space-y-2">
            <p class="text-muted">
              No {{ showUpcoming ? 'upcoming' : 'previous' }} sessions found
              <span v-if="selectedCategory !== 'All Categories'">
                for <strong>{{ selectedCategory }}</strong>
              </span>.
            </p>
            <div
              v-if="selectedCategory !== 'All Categories'"
              class="flex justify-center"
            >
              <UButton
                variant="outline"
                size="sm"
                @click="selectedCategory = 'All Categories'"
              >
                <UIcon
                  name="i-lucide-x"
                  class="w-4 h-4 mr-2"
                />
                Clear category filter
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Technical Areas -->
      <div class="mb-16">
        <h2 class="text-3xl font-bold mb-8">
          Technical Areas We Cover
        </h2>

        <UPageGrid>
          <UPageCard
            title="Lighting Design & Operation"
            description="Learn to design atmospheric lighting and operate complex lighting rigs. Master the art of painting with light to create mood and focus."
            icon="i-lucide-lightbulb"
          />

          <UPageCard
            title="Sound Design & Engineering"
            description="Create immersive soundscapes and manage live sound mixing. Learn both the technical and creative aspects of theatrical audio."
            icon="i-lucide-volume-2"
          />

          <UPageCard
            title="Rigging & Safety"
            description="Master safe rigging techniques for lighting, sound, and set pieces. Safety is paramount in all technical work."
            icon="i-lucide-hard-hat"
          />

          <UPageCard
            title="Video & Projection"
            description="Integrate modern video technology into live performances. Learn projection mapping and live video mixing techniques."
            icon="i-lucide-monitor"
          />

          <UPageCard
            title="Stage Management"
            description="Learn to coordinate all technical aspects during shows. Become the backbone that keeps productions running smoothly."
            icon="i-lucide-clipboard-list"
          />

          <UPageCard
            title="Equipment Maintenance"
            description="Keep our professional-grade technical equipment in top condition. Learn maintenance schedules and troubleshooting."
            icon="i-lucide-wrench"
          />
        </UPageGrid>
      </div>

      <!-- Safety First -->
      <div class="mb-16">
        <UAlert
          color="warning"
          variant="soft"
          class="mb-8"
        >
          <template #title>
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-shield-check"
                class="w-5 h-5"
              />
              Safety First
            </div>
          </template>
          <template #description>
            All technical work includes comprehensive safety training. We prioritize safe working practices above all else. You'll learn proper procedures before handling any equipment.
          </template>
        </UAlert>

        <h2 class="text-3xl font-bold mb-4">
          Learn with Professional Equipment
        </h2>
        <p class="text-lg text-muted mb-8">
          Our technical workshops use industry-standard equipment, giving you valuable experience with the same tools used in professional theatres.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <UCard>
            <div class="text-center p-6">
              <div class="mx-auto mb-4 w-16 h-16 rounded-full bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
                <UIcon
                  name="i-lucide-zap"
                  class="w-8 h-8 text-purple-600 dark:text-purple-400"
                />
              </div>
              <h3 class="text-xl font-semibold mb-2">
                Industry-Standard Tools
              </h3>
              <p class="text-muted">
                Work with professional lighting desks, sound mixers, and rigging systems used in theatres across the industry.
              </p>
            </div>
          </UCard>

          <UCard>
            <div class="text-center p-6">
              <div class="mx-auto mb-4 w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                <UIcon
                  name="i-lucide-users-2"
                  class="w-8 h-8 text-red-600 dark:text-red-400"
                />
              </div>
              <h3 class="text-xl font-semibold mb-2">
                Experienced Mentorship
              </h3>
              <p class="text-muted">
                Learn from experienced technicians who've worked on numerous productions and can guide your technical development.
              </p>
            </div>
          </UCard>
        </div>
      </div>

      <!-- Technical Skills -->
      <div class="mb-16">
        <h2 class="text-3xl font-bold mb-8">
          Technical Skills You'll Master
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="space-y-4">
            <h3 class="text-lg font-semibold flex items-center gap-2">
              <UIcon
                name="i-lucide-settings"
                class="w-5 h-5 text-primary"
              />
              Equipment Operation
            </h3>
            <ul class="space-y-2 text-muted">
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Lighting desk programming
              </li>
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Sound mixing and EQ
              </li>
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Video switching and routing
              </li>
            </ul>
          </div>

          <div class="space-y-4">
            <h3 class="text-lg font-semibold flex items-center gap-2">
              <UIcon
                name="i-lucide-shield"
                class="w-5 h-5 text-primary"
              />
              Safety & Standards
            </h3>
            <ul class="space-y-2 text-muted">
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Electrical safety protocols
              </li>
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Risk assessment procedures
              </li>
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Emergency procedures
              </li>
            </ul>
          </div>

          <div class="space-y-4">
            <h3 class="text-lg font-semibold flex items-center gap-2">
              <UIcon
                name="i-lucide-brain"
                class="w-5 h-5 text-primary"
              />
              Problem Solving
            </h3>
            <ul class="space-y-2 text-muted">
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Technical troubleshooting
              </li>
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Live show problem-solving
              </li>
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-check"
                  class="w-4 h-4 text-green-500 flex-shrink-0"
                />
                Equipment adaptation
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Career Benefits -->
      <div class="mb-16">
        <h2 class="text-3xl font-bold mb-4">
          Build Your Technical Portfolio
        </h2>
        <p class="text-lg text-muted mb-8">
          The skills you learn in stagecraft workshops are highly transferable and valued across many industries, from live events to broadcast media and corporate presentations.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div class="text-center p-4">
            <div class="mx-auto mb-3 w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <UIcon
                name="i-lucide-tv"
                class="w-6 h-6 text-blue-600 dark:text-blue-400"
              />
            </div>
            <h4 class="font-semibold text-sm">
              Broadcast Media
            </h4>
          </div>

          <div class="text-center p-4">
            <div class="mx-auto mb-3 w-12 h-12 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
              <UIcon
                name="i-lucide-calendar-days"
                class="w-6 h-6 text-green-600 dark:text-green-400"
              />
            </div>
            <h4 class="font-semibold text-sm">
              Live Events
            </h4>
          </div>

          <div class="text-center p-4">
            <div class="mx-auto mb-3 w-12 h-12 rounded-full bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
              <UIcon
                name="i-lucide-presentation"
                class="w-6 h-6 text-purple-600 dark:text-purple-400"
              />
            </div>
            <h4 class="font-semibold text-sm">
              Corporate AV
            </h4>
          </div>

          <div class="text-center p-4">
            <div class="mx-auto mb-3 w-12 h-12 rounded-full bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
              <UIcon
                name="i-lucide-music"
                class="w-6 h-6 text-orange-600 dark:text-orange-400"
              />
            </div>
            <h4 class="font-semibold text-sm">
              Music Industry
            </h4>
          </div>
        </div>
      </div>

      <!-- Call to Action -->
      <UPageCTA
        title="Ready to Master the Technical Arts?"
        description="Join us this Wednesday and discover the technical skills that bring theatrical magic to life. All levels welcome - safety training included."
      >
        <template #links>
          <UButton
            to="https://discord.gg/dsCaQeTYfA"
            variant="outline"
            size="xl"
            icon="i-lucide-message-circle"
            external
          >
            Join Stagecraft Discord
          </UButton>
          <UButton
            to="mailto:backstage@newtheatre.org.uk"
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

    <UModal
      v-if="selectedSession"
      v-model:open="isSessionModalOpen"
      :title="selectedSession.title"
      :description="selectedSession.description"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <div class="space-y-6">
          <!-- Session Details -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-elevated rounded-lg">
            <div class="flex items-center gap-2 text-sm">
              <UIcon
                name="i-lucide-calendar"
                class="w-4 h-4 text-primary"
              />
              <span class="font-medium">Date:</span>
              <span>{{ formatDate(selectedSession.date) }}</span>
            </div>

            <div
              v-if="selectedSession.time?.start"
              class="flex items-center gap-2 text-sm"
            >
              <UIcon
                name="i-lucide-clock"
                class="w-4 h-4 text-primary"
              />
              <span class="font-medium">Time:</span>
              <span>{{ formatSessionTime(selectedSession) }}</span>
            </div>

            <div
              v-if="selectedSession.location"
              class="flex items-center gap-2 text-sm"
            >
              <UIcon
                name="i-lucide-map-pin"
                class="w-4 h-4 text-primary"
              />
              <span class="font-medium">Location:</span>
              <span>{{ selectedSession.location }}</span>
            </div>

            <div
              v-if="selectedSession.category"
              class="flex items-center gap-2 text-sm"
            >
              <UIcon
                name="i-lucide-tag"
                class="w-4 h-4 text-primary"
              />
              <span class="font-medium">Category:</span>
              <span>{{ selectedSession.category }}</span>
            </div>

            <div
              v-if="selectedSession.leaders && selectedSession.leaders.length > 0"
              class="flex items-center gap-2 text-sm sm:col-span-2"
            >
              <UIcon
                name="i-lucide-users"
                class="w-4 h-4 text-primary"
              />
              <span class="font-medium">Led by:</span>
              <span>{{ selectedSession.leaders.join(', ') }}</span>
            </div>
          </div>

          <!-- Session Content -->
          <div class="prose prose-sm max-w-none dark:prose-invert">
            <ContentRenderer :value="selectedSession" />
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <UAlert
          v-if="selectedSession.cancelled"
          color="error"
          variant="solid"
          title="This session has been cancelled."
        />
        <template v-else>
          <UButton
            @click="addToCalendar(selectedSession)"
          >
            Add to Calendar
          </UButton>
          <UButton
            variant="outline"
            @click="close"
          >
            Close
          </UButton>
        </template>
      </template>
    </UModal>
  </div>
</template>

<script setup>
// Fetch all stagecraft sessions
const { data: allSessions } = await useAsyncData('stagecraft-sessions', () =>
  queryCollection('stagecraft').all(),
)

// Reactive state
const showUpcoming = ref(true)
const showAllSessions = ref(false)
const isSessionModalOpen = ref(false)
const selectedSession = ref(null)
const selectedCategory = ref('All Categories')

const toast = useToast()

// Computed categories from all sessions
const availableCategories = computed(() => {
  if (!allSessions.value) return []

  const categories = [...new Set(allSessions.value
    .map(session => session.category)
    .filter(Boolean),
  )].sort()

  return [
    'All Categories',
    ...categories,
  ]
})

// Computed filtered sessions based on upcoming/previous toggle and category filter
const filteredSessions = computed(() => {
  if (!allSessions.value) return []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return allSessions.value
    .filter((session) => {
      // Date filter
      const sessionDate = new Date(session.date)
      sessionDate.setHours(0, 0, 0, 0)

      const dateMatch = showUpcoming.value
        ? sessionDate >= today
        : sessionDate < today

      // Category filter
      const categoryMatch = selectedCategory.value === 'All Categories' || session.category === selectedCategory.value

      return dateMatch && categoryMatch
    })
    .sort((a, b) => {
      const dateA = new Date(a.date)
      const dateB = new Date(b.date)
      return showUpcoming.value ? dateA - dateB : dateB - dateA
    })
})

// Computed sessions to display (limited to 3 unless showing all)
const displayedSessions = computed(() => {
  const sessions = filteredSessions.value
  return showAllSessions.value ? sessions : sessions.slice(0, 3)
})

// Helper functions
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const formatTime = (time) => {
  if (!time) return ''
  return time
}

const calculateDuration = (startTime, endTime) => {
  if (!startTime || !endTime) return ''

  const [startHours, startMinutes] = startTime.split(':').map(Number)
  const [endHours, endMinutes] = endTime.split(':').map(Number)

  const startTotalMinutes = startHours * 60 + startMinutes
  const endTotalMinutes = endHours * 60 + endMinutes
  const durationMinutes = endTotalMinutes - startTotalMinutes

  if (durationMinutes <= 0) return ''

  const hours = Math.floor(durationMinutes / 60)
  const minutes = durationMinutes % 60

  if (hours === 0) return `${minutes}min`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}min`
}

const formatSessionTime = (session) => {
  if (!session.time?.start) return ''

  const startTime = formatTime(session.time.start)
  const duration = calculateDuration(session.time.start, session.time.end)

  if (!duration) return startTime
  return `${startTime} (${duration})`
}

const isSessionComplete = (session) => {
  const now = new Date()
  const sessionDate = new Date(session.date)

  if (session.time?.end) {
    const [hours, minutes] = session.time.end.split(':').map(Number)
    sessionDate.setHours(hours, minutes, 0, 0)
  }
  else if (session.time?.start) {
    const [hours, minutes] = session.time.start.split(':').map(Number)
    sessionDate.setHours(hours + 1, minutes, 0, 0) // Default 1 hour duration
  }
  else {
    sessionDate.setHours(17, 0, 0, 0)
  }

  return now > sessionDate
}

const getSessionStatus = (session) => {
  if (session.cancelled) return 'Cancelled'
  if (isSessionComplete(session)) return 'Completed'
  return 'Upcoming'
}

const getSessionStatusColor = (session) => {
  const status = getSessionStatus(session)
  switch (status) {
    case 'Cancelled':
      return 'error'
    case 'Completed':
      return 'success'
    case 'Upcoming':
      return 'info'
    default:
      return 'neutral'
  }
}

const openSessionModal = (session) => {
  selectedSession.value = session
  isSessionModalOpen.value = true
}

const addToCalendar = (_event) => {
  toast.add({
    title: 'Add to Calendar',
    description: 'This feature is coming soon!',
    color: 'warning',
  })
}

useSeoMeta({
  title: 'Stagecraft - Nottingham New Theatre',
  description: 'Master the technical arts that bring theatrical productions to life. Learn lighting, sound, rigging, and stage management at England\'s only fully student-run theatre.',
  ogTitle: 'Stagecraft - Nottingham New Theatre',
  ogDescription: 'Master the technical arts that bring theatrical productions to life. Learn lighting, sound, rigging, and stage management at England\'s only fully student-run theatre.',
  twitterCard: 'summary_large_image',
})
</script>
