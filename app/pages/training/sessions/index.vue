<script setup lang="ts">
import { saysGaps } from '#shared/utils/training'
import { saysClosure, saysPlace } from '#shared/utils/training-signup'
import type { PrerequisiteGap } from '#shared/utils/training'
import type { ClosureReason } from '#shared/utils/training-signup'

definePageMeta({ layout: 'member', middleware: 'signed-in' })

interface Session {
  id: string
  heldOn: string
  startsAt: string
  endsAt: string
  place: string | null
  capacity: number
  status: string
  trainerName: string
  signedUp: number
  myStatus: string | null
  myPosition: number | null
  placed: boolean
  waitlistPosition: number | null
  closure: ClosureReason | null
  modules: { id: string, name: string, safetyCritical: boolean }[]
  blocked: PrerequisiteGap[]
  warnings: PrerequisiteGap[]
}

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const working = ref<string | null>(null)

const { data, status, refresh } = await useAsyncData(
  'training-sessions',
  () => request<{ items: Session[], total: number }>('/api/training/sessions'),
  { default: (): { items: Session[], total: number } => ({ items: [], total: 0 }) },
)

const mine = computed(() => data.value.items.filter(session => session.myPosition !== null))
const open = computed(() => data.value.items.filter(session => session.myPosition === null))

interface SignUpAnswer {
  placed: boolean
  waitlistPosition: number | null
  warnings: PrerequisiteGap[]
}

async function signUp(session: Session): Promise<void> {
  failure.value = null
  working.value = session.id
  try {
    const answer = await $fetch<SignUpAnswer>(`/api/training/sessions/${session.id}/signup`, { method: 'POST' })
    toast.add({
      title: saysPlace(answer),
      description: answer.warnings.length > 0
        ? `You are in. Worth knowing: this one usually follows ${saysGaps(answer.warnings)}.`
        : 'You are on the list. Withdraw here if you cannot make it after all.',
      icon: 'i-lucide-check',
      color: answer.placed ? 'success' : 'warning',
    })
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    working.value = null
  }
}

async function withdraw(session: Session): Promise<void> {
  failure.value = null
  working.value = session.id
  try {
    await $fetch(`/api/training/sessions/${session.id}/signup`, { method: 'DELETE' })
    toast.add({
      title: 'Withdrawn',
      description: 'Your place has gone to whoever was next. You can sign up again, at the back of the list.',
      icon: 'i-lucide-check',
      color: 'neutral',
    })
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    working.value = null
  }
}

const placesLeft = (session: Session): number => Math.max(0, session.capacity - session.signedUp)
</script>

<template>
  <UContainer
    class="max-w-3xl py-16"
    data-test="sessions-page"
  >
    <UPageHeader
      title="Training sessions"
      description="What is being taught, and where you stand on each one. Past the last place you join the waiting list rather than being turned away."
    />

    <UAlert
      v-if="failure"
      class="mt-6"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <div
      v-if="status === 'pending'"
      class="mt-8 flex items-center gap-3 text-muted"
      data-test="sessions-loading"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="animate-spin"
      />
      Reading the schedule
    </div>

    <section
      v-if="mine.length > 0"
      class="mt-8"
      data-test="my-sessions"
    >
      <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">
        What you are signed up to
      </h2>

      <ul class="mt-3 space-y-3">
        <li
          v-for="session in mine"
          :key="session.id"
          class="rounded-lg border border-default p-4"
          :data-test="`mine-${session.id}`"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ session.modules.map(module => module.name).join(', ') }}</span>
                <UBadge
                  :color="session.placed ? 'success' : 'warning'"
                  variant="subtle"
                  size="sm"
                  :data-test="`standing-${session.id}`"
                >
                  {{ session.placed ? 'You have a place' : `Waiting, number ${session.waitlistPosition}` }}
                </UBadge>
              </div>
              <p class="mt-1 text-sm text-muted">
                {{ session.heldOn }}, {{ session.startsAt }} to {{ session.endsAt }}
                <template v-if="session.place">
                  · {{ session.place }}
                </template>
                · with {{ session.trainerName }}
              </p>
              <p
                v-if="!session.placed"
                class="mt-1 text-sm text-muted"
              >
                A place comes to you the moment somebody drops out, and we will email you when it does.
              </p>
            </div>

            <UButton
              color="neutral"
              variant="outline"
              size="xs"
              :loading="working === session.id"
              :data-test="`withdraw-${session.id}`"
              @click="withdraw(session)"
            >
              Withdraw
            </UButton>
          </div>
        </li>
      </ul>
    </section>

    <section
      class="mt-12"
      data-test="open-sessions"
    >
      <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">
        Coming up
      </h2>

      <p
        v-if="open.length === 0"
        class="mt-3 text-muted"
        data-test="sessions-empty"
      >
        Nothing else is in the diary just now. Ask for a module to be taught on
        <ULink to="/training">
          your training page
        </ULink>
        and the department will know there is demand for it.
      </p>

      <ul
        v-else
        class="mt-3 space-y-3"
      >
        <li
          v-for="session in open"
          :key="session.id"
          class="rounded-lg border border-default p-4"
          :data-test="`session-${session.id}`"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ session.modules.map(module => module.name).join(', ') }}</span>
                <UBadge
                  v-if="placesLeft(session) === 0"
                  color="warning"
                  variant="subtle"
                  size="sm"
                  :data-test="`waitlisting-${session.id}`"
                >
                  Waiting list
                </UBadge>
              </div>
              <p class="mt-1 text-sm text-muted">
                {{ session.heldOn }}, {{ session.startsAt }} to {{ session.endsAt }}
                <template v-if="session.place">
                  · {{ session.place }}
                </template>
                · with {{ session.trainerName }}
              </p>
              <p class="mt-1 text-sm text-muted">
                <template v-if="placesLeft(session) > 0">
                  {{ placesLeft(session) === 1 ? 'One place left' : `${placesLeft(session)} places left` }}
                </template>
                <template v-else>
                  Full, so signing up puts you next in line rather than turning you away
                </template>
              </p>

              <p
                v-if="session.blocked.length > 0"
                class="mt-2 text-sm text-warning"
                :data-test="`blocked-${session.id}`"
              >
                This one is safety critical, so it needs {{ saysGaps(session.blocked) }} first.
                Ask for those on
                <ULink to="/training">
                  your training page
                </ULink>
                and you can come to the next one.
              </p>
              <p
                v-else-if="session.warnings.length > 0"
                class="mt-2 text-sm text-muted"
                :data-test="`warning-${session.id}`"
              >
                This usually follows {{ saysGaps(session.warnings) }}. You can still come: the
                trainer will know whether it matters on the night.
              </p>
              <p
                v-if="session.closure"
                class="mt-2 text-sm text-muted"
                :data-test="`closed-${session.id}`"
              >
                {{ saysClosure(session.closure) }}
              </p>
            </div>

            <UButton
              v-if="session.blocked.length === 0 && !session.closure"
              size="xs"
              :loading="working === session.id"
              :data-test="`signup-${session.id}`"
              @click="signUp(session)"
            >
              {{ placesLeft(session) > 0 ? 'Sign up' : 'Join the waiting list' }}
            </UButton>
          </div>
        </li>
      </ul>
    </section>
  </UContainer>
</template>
