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
  cancelReason: string | null
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
const toast = useToast()

const failure = ref<string | null>(null)
const working = ref(false)
const calling = ref(false)
const reason = ref('')

const { data, status, error, refresh } = await useAsyncData(
  () => `session-${route.params.id}`,
  () => request<Session>(`/api/admin/training/sessions/${route.params.id}`),
  { default: () => null as Session | null },
)

const registerOpen = computed(() => data.value?.registerOpenedAt !== null)
const marked = computed(() => data.value?.markedAt !== null)
const cancelled = computed(() => data.value?.status === 'CANCELLED')

// Mandatory, because a cancellation with no reason is the locked door this exists to prevent.
async function callOff(): Promise<void> {
  if (!reason.value.trim()) return
  working.value = true
  failure.value = null
  try {
    const answered = await $fetch<{ told: number }>(
      `/api/admin/training/sessions/${route.params.id}/cancel`,
      { method: 'POST', body: { reason: reason.value.trim() } },
    )
    toast.add({
      title: 'Session cancelled',
      description: `${plural(answered.told, 'person', 'people')} told why.`,
      icon: 'i-lucide-ban',
      color: 'success',
    })
    calling.value = false
    reason.value = ''
    await refresh()
  }
  catch (caught) {
    failure.value = refusalText(caught)
  }
  finally {
    working.value = false
  }
}

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
        v-if="failure"
        data-test="failure"
        color="error"
        variant="subtle"
        :description="failure"
      />

      <UAlert
        v-if="cancelled"
        color="error"
        variant="subtle"
        icon="i-lucide-ban"
        data-test="session-cancelled"
        title="This session was cancelled"
        :description="data.cancelReason
          ? `${data.cancelReason} Everybody signed up was told, and its register can never be opened.`
          : 'It awards nothing, and its register can never be opened.'"
      />

      <!-- Only before the register opens: after that the session happened, and the edit window is
        how it is put right (G-113 criterion 5). -->
      <div
        v-else-if="!registerOpen && !calling"
        class="flex justify-end"
      >
        <UButton
          color="error"
          variant="outline"
          icon="i-lucide-ban"
          data-test="cancel-session"
          @click="calling = true"
        >
          Cancel this session
        </UButton>
      </div>

      <div
        v-else-if="!registerOpen && calling"
        class="space-y-3 rounded-lg border border-default p-4"
        data-test="cancel-panel"
      >
        <UFormField
          label="Why it is off"
          required
          description="Everybody signed up is emailed this, so write it for them."
        >
          <UTextarea
            v-model="reason"
            :rows="2"
            class="w-full"
            placeholder="The trainer is unwell and we would rather run it properly."
            data-test="cancel-reason"
          />
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton
            color="error"
            :loading="working"
            :disabled="!reason.trim()"
            data-test="cancel-submit"
            @click="callOff"
          >
            Cancel it and tell everybody
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            @click="calling = false"
          >
            Back
          </UButton>
        </div>
      </div>

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
