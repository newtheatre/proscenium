<script setup lang="ts">
import { saysSessionStatus } from '#shared/utils/training'

definePageMeta({ layout: 'console', title: 'Session', middleware: 'console' })

interface Attendee {
  userId: string
  name: string
  source: string
  status: string
  placed: boolean
  waitlistPosition: number | null
}

interface Session {
  id: string
  heldOn: string
  startsAt: string
  endsAt: string
  place: string | null
  capacity: number
  opensAt: number | null
  notes: string | null
  status: string
  trainerName: string | null
  registerOpenedAt: number | null
  markedAt: number | null
  modules: { id: string, name: string, safetyCritical: boolean }[]
  attendees: Attendee[]
}

const route = useRoute()
const request = useRequestFetch()

const { data, status, error } = await useAsyncData(
  () => `session-${route.params.id}`,
  () => request<Session>(`/api/admin/training/sessions/${route.params.id}`),
  { default: () => null as Session | null },
)

const registerOpen = computed(() => data.value?.registerOpenedAt !== null)
const marked = computed(() => data.value?.markedAt !== null)
const cancelled = computed(() => data.value?.status === 'CANCELLED')

// What the button offers depends on where the session has got to, so it says which of those it is.
const registerLabel = computed(() => {
  if (marked.value) return 'See the register'
  return registerOpen.value ? 'Carry on with the register' : 'Take the register'
})
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-unplug"
      data-test="load-failed"
      title="That session could not be read"
      description="Try again before you rely on what is on this page."
    />

    <div
      v-else-if="status === 'pending'"
      class="flex items-center gap-3 py-8 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="animate-spin"
      />
      Reading the session
    </div>

    <template v-else-if="data">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-1">
          <UButton
            to="/training/manage/sessions"
            variant="link"
            color="neutral"
            size="sm"
            icon="i-lucide-arrow-left"
            class="px-0"
          >
            Sessions
          </UButton>
          <h1 class="text-xl font-semibold">
            {{ data.heldOn }}
          </h1>
          <p class="text-sm text-muted">
            {{ data.startsAt }} to {{ data.endsAt }}<template v-if="data.place">
              · {{ data.place }}
            </template><template v-if="data.trainerName">
              · {{ data.trainerName }}
            </template>
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :color="data.status === 'OPEN' ? 'success' : cancelled ? 'error' : 'neutral'"
            variant="subtle"
            data-test="session-status"
          >
            {{ saysSessionStatus(data.status) }}
          </UBadge>
          <UButton
            v-if="!cancelled"
            :to="`/training/sessions/${data.id}/register`"
            icon="i-lucide-clipboard-check"
            data-test="take-register"
          >
            {{ registerLabel }}
          </UButton>
        </div>
      </div>

      <UAlert
        v-if="cancelled"
        color="error"
        variant="subtle"
        icon="i-lucide-ban"
        title="This session was cancelled"
        description="It awards nothing, and its register can never be opened."
      />

      <UAlert
        v-else-if="marked"
        color="success"
        variant="subtle"
        icon="i-lucide-check"
        data-test="session-marked"
        title="The register has been marked"
        description="The records are made. Correcting one now is a revocation and a re-grant, not a second mark."
      />

      <UAlert
        v-else-if="data.opensAt !== null && !registerOpen"
        color="neutral"
        variant="subtle"
        icon="i-lucide-clock"
        data-test="session-planned"
        title="Not open for sign-up yet"
        description="Members cannot see this session until it opens."
      />

      <div class="grid gap-6 lg:grid-cols-3">
        <section class="space-y-3 lg:col-span-2">
          <h2 class="text-sm font-semibold">
            Who is coming
          </h2>
          <ul
            v-if="data.attendees.length"
            class="divide-y divide-default rounded-md border border-default"
            data-test="session-attendees"
          >
            <li
              v-for="one in data.attendees"
              :key="one.userId"
              class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span>{{ one.name }}</span>
              <span class="flex items-center gap-2">
                <UBadge
                  v-if="one.source === 'WALK_IN'"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  Walk-in
                </UBadge>
                <UBadge
                  v-if="!one.placed"
                  color="warning"
                  variant="subtle"
                  size="sm"
                  :data-test="`waitlist-${one.userId}`"
                >
                  Waiting, number {{ one.waitlistPosition }}
                </UBadge>
                <UBadge
                  v-else
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  Has a place
                </UBadge>
              </span>
            </li>
          </ul>
          <p
            v-else
            class="rounded-md border border-default px-3 py-6 text-center text-sm text-muted"
            data-test="session-nobody"
          >
            Nobody has signed up yet. You can still add whoever turns up once the register is open.
          </p>
          <p class="text-sm text-muted">
            {{ plural(data.capacity, 'place') }} on this session.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-sm font-semibold">
            What it teaches
          </h2>
          <ul class="flex flex-wrap gap-1">
            <li
              v-for="module in data.modules"
              :key="module.id"
            >
              <UBadge
                :color="module.safetyCritical ? 'warning' : 'neutral'"
                variant="subtle"
              >
                {{ module.id }}
              </UBadge>
            </li>
          </ul>

          <template v-if="data.notes">
            <h2 class="text-sm font-semibold">
              Notes
            </h2>
            <p class="whitespace-pre-line text-sm text-muted">
              {{ data.notes }}
            </p>
          </template>
        </section>
      </div>
    </template>
  </div>
</template>
