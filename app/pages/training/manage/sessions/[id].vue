<script setup lang="ts">
import { saysDay } from '#shared/utils/when'
import { SESSION_CAPACITY_MAX, SESSION_CAPACITY_MIN, saysSessionStatus } from '#shared/utils/training'

definePageMeta({ layout: 'console', title: 'Session', middleware: 'console', docs: '/docs/training/sessions' })

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

// The same short London day the member-facing list reads, so a date means one thing either side.
const sessionDay = (heldOn: string): string =>
  saysDay(heldOn)

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

// The route refuses once the register opens, so the screen does not offer what it would refuse.
const canChangePlaces = computed(() =>
  !!data.value && ['PLANNED', 'OPEN', 'FULL'].includes(data.value.status) && !registerOpen.value)

const changingPlaces = ref(false)
const places = ref(0)
const placesFailure = ref<string | null>(null)
const placesResult = ref<string | null>(null)

const placedNow = computed(() => data.value?.attendees.filter(one => one.placed).length ?? 0)
const waitingNow = computed(() => data.value?.attendees.filter(one => !one.placed).length ?? 0)

// Said before saving, because either way somebody is emailed (G-106 criteria 1 and 6).
const placesConsequence = computed(() => {
  if (!data.value) return ''
  const movedBack = Math.max(0, placedNow.value - places.value)
  if (movedBack > 0) {
    return `${plural(movedBack, 'person', 'people')} will move back to the waiting list, and each is emailed their number.`
  }
  const promoted = Math.min(waitingNow.value, Math.max(0, places.value - data.value.capacity))
  if (promoted > 0) {
    return `${plural(promoted, 'person', 'people')} waiting will get a place, and each is emailed.`
  }
  return 'Nobody moves.'
})

function startChangingPlaces(): void {
  places.value = data.value?.capacity ?? SESSION_CAPACITY_MIN
  placesFailure.value = null
  placesResult.value = null
  changingPlaces.value = true
}

async function savePlaces(): Promise<void> {
  working.value = true
  placesFailure.value = null
  try {
    const answered = await $fetch<{ promoted: number, movedBack: number }>(
      `/api/admin/training/sessions/${route.params.id}/capacity`,
      { method: 'POST', body: { capacity: places.value } },
    )
    const moved = [
      answered.promoted > 0 ? `${answered.promoted} promoted` : null,
      answered.movedBack > 0 ? `${answered.movedBack} moved back to the waiting list` : null,
    ].filter(Boolean)
    placesResult.value = `Places changed to ${places.value}. ${moved.length ? `${moved.join(', ')}, each emailed.` : 'Nobody moved.'}`
    changingPlaces.value = false
    await refresh()
  }
  catch (caught) {
    placesFailure.value = refusalText(caught)
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
            {{ sessionDay(data.heldOn) }}
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
        v-if="failure && !calling"
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
          <div class="flex flex-wrap items-center gap-2">
            <p
              class="text-sm text-muted"
              data-test="session-places"
            >
              {{ plural(data.capacity, 'place') }} on this session.
            </p>
            <UButton
              v-if="canChangePlaces && !changingPlaces"
              size="xs"
              variant="link"
              icon="i-lucide-pencil"
              data-test="edit-capacity"
              @click="startChangingPlaces"
            >
              Change the places
            </UButton>
          </div>

          <UAlert
            v-if="placesResult"
            color="success"
            variant="subtle"
            icon="i-lucide-check"
            data-test="capacity-result"
            :description="placesResult"
          />

          <form
            v-if="changingPlaces"
            class="space-y-3 rounded-md border border-default p-3"
            data-test="capacity-form"
            @submit.prevent="savePlaces"
          >
            <UFormField
              label="Places"
              :description="`Between ${SESSION_CAPACITY_MIN} and ${SESSION_CAPACITY_MAX}. ${placesConsequence}`"
            >
              <UInputNumber
                v-model="places"
                :min="SESSION_CAPACITY_MIN"
                :max="SESSION_CAPACITY_MAX"
                data-test="capacity-input"
              />
            </UFormField>
            <UAlert
              v-if="placesFailure"
              color="error"
              variant="subtle"
              data-test="capacity-failure"
              :description="placesFailure"
            />
            <div class="flex flex-wrap gap-2">
              <UButton
                type="submit"
                :loading="working"
                data-test="capacity-save"
              >
                Save the places
              </UButton>
              <UButton
                color="neutral"
                variant="ghost"
                @click="changingPlaces = false"
              >
                Keep it as it is
              </UButton>
            </div>
          </form>
        </section>

        <section class="space-y-3">
          <h2 class="text-sm font-semibold">
            What it teaches
          </h2>
          <ul class="flex flex-wrap gap-1">
            <li
              v-for="module in data.modules"
              :key="module.id"
              class="flex items-center gap-1"
            >
              <UBadge
                :color="module.safetyCritical ? 'warning' : 'neutral'"
                variant="subtle"
              >
                {{ module.id }}
              </UBadge>
              <UBadge
                v-if="module.safetyCritical"
                color="warning"
                variant="subtle"
                size="sm"
                :data-test="`safety-critical-${module.id}`"
              >
                Safety critical
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

      <ConfirmModal
        v-model:open="calling"
        name="cancel-session"
        title="Cancel this session"
        verb="Cancel the session and tell everybody"
        consequence="It awards nothing, its register can never be opened, and everybody signed up is emailed what you write."
        :loading="working"
        :disabled="!reason.trim()"
        :failure="failure"
        @confirm="callOff"
      >
        <template #body>
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
        </template>
      </ConfirmModal>
    </template>
  </div>
</template>
