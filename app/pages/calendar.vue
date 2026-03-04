<template>
  <UApp>
    <UMain>
      <UContainer class="py-8">
        <UPageHeader
          title="Theatre Calendar"
          description="View upcoming events and sessions"
        />

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          <!-- TODO: Implement calendar component with date filtering -->
          <div class="lg:col-span-1">
            <UCard>
              <template #header>
                <h3 class="text-lg font-semibold">
                  Calendar
                </h3>
              </template>

              <USkeleton class="h-64" />

              <div class="mt-4">
                <UButton
                  variant="outline"
                  color="gray"
                  block
                  disabled
                >
                  Calendar Coming Soon
                </UButton>
              </div>
            </UCard>
          </div>

          <!-- Events List Section -->
          <div class="lg:col-span-2">
            <UCard>
              <template #header>
                <div class="flex justify-between items-center">
                  <h3 class="text-lg font-semibold">
                    Upcoming Events
                  </h3>

                  <div class="flex items-center gap-2">
                    <UBadge
                      v-if="filteredEvents.length > 0"
                      :label="filteredEvents.length.toString()"
                      color="primary"
                    />
                  </div>
                </div>
              </template>

              <div
                v-if="pending"
                class="space-y-4"
              >
                <USkeleton
                  v-for="i in 5"
                  :key="i"
                  class="h-20 w-full"
                />
              </div>

              <div
                v-else-if="error"
                class="text-center py-8"
              >
                <UAlert
                  color="red"
                  variant="soft"
                  title="Error loading events"
                  :description="error.message"
                />
              </div>

              <div
                v-else-if="filteredEvents.length === 0"
                class="text-center py-8"
              >
                <div class="text-gray-500">
                  <UIcon
                    name="i-heroicons-calendar-days"
                    class="w-12 h-12 mx-auto mb-4"
                  />
                  <p>
                    No events found in the current date range
                  </p>
                </div>
              </div>

              <div
                v-else
                class="space-y-4"
              >
                <div
                  v-for="event in filteredEvents"
                  :key="event.summary + event.start"
                  class="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-2 mb-2">
                        <UBadge
                          :label="formatEventDuration(event.start, event.end)"
                          color="blue"
                          size="sm"
                        />
                        <UBadge
                          v-if="isMultiDay(event.start, event.end)"
                          label="Multi-day"
                          color="purple"
                          size="sm"
                        />
                        <UBadge
                          v-if="event.isRecurring"
                          label="Recurring"
                          color="green"
                          size="sm"
                        />
                      </div>

                      <h4 class="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        {{ event.summary }}
                      </h4>

                      <div class="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-2">
                        <div class="flex items-center gap-1">
                          <UIcon
                            name="i-heroicons-calendar"
                            class="w-4 h-4"
                          />
                          {{ formatDateRange(event.start, event.end) }}
                        </div>

                        <div
                          v-if="event.location"
                          class="flex items-center gap-1"
                        >
                          <UIcon
                            name="i-heroicons-map-pin"
                            class="w-4 h-4"
                          />
                          {{ event.location }}
                        </div>
                      </div>

                      <p
                        v-if="event.description"
                        class="text-gray-700 dark:text-gray-300 text-sm line-clamp-3"
                      >
                        {{ formatDescription(event.description) }}
                      </p>
                    </div>

                    <UDropdownMenu :items="getEventActions(event)">
                      <UButton
                        variant="ghost"
                        color="gray"
                        icon="i-heroicons-ellipsis-vertical"
                        size="sm"
                      />
                    </UDropdownMenu>
                  </div>
                </div>
              </div>
            </UCard>
          </div>
        </div>

        <!-- Event Details Modal -->
        <UModal
          v-model:open="showEventModal"
          :title="selectedEvent?.summary"
          :ui="{ footer: 'justify-end' }"
        >
          <template #body>
            <div
              v-if="selectedEvent"
              class="space-y-4"
            >
              <div>
                <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-1">
                  Date & Time
                </h4>
                <p class="text-gray-600 dark:text-gray-400">
                  {{ formatDateRange(selectedEvent.start, selectedEvent.end) }}
                </p>
              </div>

              <div v-if="selectedEvent.location">
                <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-1">
                  Location
                </h4>
                <p class="text-gray-600 dark:text-gray-400">
                  {{ selectedEvent.location }}
                </p>
              </div>

              <div v-if="selectedEvent.description">
                <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-1">
                  Description
                </h4>
                <p class="text-gray-600 dark:text-gray-400">
                  {{ selectedEvent.description }}
                </p>
              </div>

              <div class="flex items-center gap-2 pt-2">
                <UBadge
                  :label="formatEventDuration(selectedEvent.start, selectedEvent.end)"
                  color="blue"
                  size="sm"
                />
                <UBadge
                  v-if="isMultiDay(selectedEvent.start, selectedEvent.end)"
                  label="Multi-day"
                  color="purple"
                  size="sm"
                />
                <UBadge
                  v-if="selectedEvent.isRecurring"
                  label="Recurring"
                  color="green"
                  size="sm"
                />
              </div>
            </div>
          </template>

          <template #footer="{ close }">
            <UButton
              label="Add to Calendar"
              color="primary"
              @click="addToCalendar(selectedEvent); close()"
            />
            <UButton
              label="Close"
              color="neutral"
              variant="outline"
              @click="close"
            />
          </template>
        </UModal>
      </UContainer>
    </UMain>
  </UApp>
</template>

<script setup>
const { data: events, pending, error } = await useFetch('/api/v1/calendar')

const toast = useToast()

// Modal state
const selectedEvent = ref(null)
const showEventModal = ref(false)

// Filter events - just show all events from server for now
const filteredEvents = computed(() => {
  if (!events.value || !Array.isArray(events.value)) return []
  return events.value
})

// Utility functions
const formatDateRange = (start, end) => {
  const startDate = new Date(start)
  const endDate = new Date(end)

  // Check if times are specified (not all-day events)
  const hasTime = start.includes('T') && !start.endsWith('T00:00:00.000Z')

  if (isMultiDay(start, end)) {
    if (hasTime) {
      return `${startDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })} ${startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })} ${endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    }
    return `${startDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}`
  }

  if (hasTime) {
    return `${startDate.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })} ${startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  }

  return startDate.toLocaleDateString('en-GB', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

const formatEventDuration = (start, end) => {
  const startDate = new Date(start)
  const endDate = new Date(end)

  if (isMultiDay(start, end)) {
    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
    return `${days} days`
  }

  // Check if times are specified
  const hasTime = start.includes('T') && !start.endsWith('T00:00:00.000Z')

  if (hasTime) {
    const duration = Math.floor((endDate - startDate) / (1000 * 60 * 60))
    return duration > 0 ? `${duration}h` : 'All day'
  }

  return 'All day'
}

const isMultiDay = (start, end) => {
  const startDate = new Date(start).toDateString()
  const endDate = new Date(end).toDateString()
  return startDate !== endDate
}

const formatDescription = (description) => {
  if (!description) return ''

  // Remove HTML tags and limit length
  return description
    .replace(/<[^>]*>/g, '')
    .replace(/\n/g, ' ')
    .substring(0, 200) + (description.length > 200 ? '...' : '')
}

// Event action handlers
const viewEventDetails = (event) => {
  selectedEvent.value = event
  showEventModal.value = true
}

const addToCalendar = (_event) => {
  toast.add({
    title: 'Add to Calendar',
    description: `This feature is coming soon!`,
    color: 'warning',
  })
}

const getEventActions = event => [
  [
    {
      label: 'View Details',
      // icon: '',
      onSelect: () => viewEventDetails(event),
    },
    {
      label: 'Add to Calendar',
      onSelect: () => addToCalendar(event),
    },
  ],
]

// Set page meta
useSeoMeta({
  title: 'Theatre Calendar - Proscenium',
  description: 'View upcoming theatre events and performances',
})
</script>

<style scoped>
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
