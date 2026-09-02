<script setup lang="ts">
// A trainer on a door, holding a phone in one hand. Big targets, no hover, nothing that needs a
// wide viewport: the tonight shell, which 0040 named for exactly this (G-116 criterion 6).
definePageMeta({ layout: 'tonight', title: 'Register', middleware: 'signed-in' })

interface Attendee {
  userId: string
  name: string
  source: string
  status: string
}

interface Register {
  id: string
  heldOn: string
  startsAt: string
  endsAt: string
  place: string | null
  status: string
  registerOpenedAt: number | null
  markedAt: number | null
  modules: { id: string, name: string }[]
  attendees: Attendee[]
}

const route = useRoute()
const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const working = ref(false)
const confirmingAllAbsent = ref(false)

const { data, status, error, refresh } = await useAsyncData(
  () => `register-${route.params.id}`,
  () => request<Register>(`/api/admin/training/sessions/${route.params.id}/register`),
  { default: () => null as Register | null },
)

// Everybody starts absent, which is the safe default: a record is created by saying somebody was
// there, never by failing to say they were not (G-116 criterion 1).
const present = ref(new Set<string>())

const open = computed(() => data.value?.registerOpenedAt !== null)
const marked = computed(() => data.value?.markedAt !== null)
const attendees = computed(() => data.value?.attendees ?? [])
const presentCount = computed(() => attendees.value.filter(one => present.value.has(one.userId)).length)

function toggle(userId: string): void {
  const next = new Set(present.value)
  if (next.has(userId)) next.delete(userId)
  else next.add(userId)
  present.value = next
}

async function openRegister(): Promise<void> {
  working.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/training/sessions/${route.params.id}/open-register`, { method: 'POST' })
    toast.add({ title: 'Register open', icon: 'i-lucide-clipboard-check', color: 'success' })
    await refresh()
  }
  catch (caught) {
    failure.value = refusalText(caught)
  }
  finally {
    working.value = false
  }
}

async function submit(): Promise<void> {
  if (presentCount.value === 0 && !confirmingAllAbsent.value) {
    confirmingAllAbsent.value = true
    return
  }
  working.value = true
  failure.value = null
  try {
    const answered = await $fetch<{ awarded: number }>(
      `/api/admin/training/sessions/${route.params.id}/mark`,
      {
        method: 'POST',
        body: {
          marks: attendees.value.map(one => ({
            userId: one.userId,
            mark: present.value.has(one.userId) ? 'ATTENDED' : 'ABSENT',
          })),
          confirmedAllAbsent: confirmingAllAbsent.value,
        },
      },
    )
    toast.add({
      title: `${plural(answered.awarded, 'record')} awarded`,
      description: 'Dated to the day of the session.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    confirmingAllAbsent.value = false
    await refresh()
  }
  catch (caught) {
    failure.value = refusalText(caught)
    confirmingAllAbsent.value = false
  }
  finally {
    working.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-xl space-y-5">
    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <!-- A failed read and an empty register look the same, and "nobody signed up" is an answer a
      trainer would act on by going home. -->
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-unplug"
      data-test="load-failed"
      title="The register could not be read"
      description="This is not the same as nobody being on it. Try again before you start marking."
    />

    <div
      v-else-if="status === 'pending'"
      class="flex items-center gap-3 py-8 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="animate-spin"
      />
      Reading the register
    </div>

    <template v-else-if="data">
      <header class="space-y-1">
        <h1 class="nnt-headline text-2xl">
          {{ data.heldOn }}
        </h1>
        <p class="text-sm text-muted">
          {{ data.startsAt }} to {{ data.endsAt }}<template v-if="data.place">
            · {{ data.place }}
          </template>
        </p>
        <div class="flex flex-wrap gap-1 pt-1">
          <UBadge
            v-for="module in data.modules"
            :key="module.id"
            color="neutral"
            variant="subtle"
            size="sm"
          >
            {{ module.id }}
          </UBadge>
        </div>
      </header>

      <UAlert
        v-if="marked"
        color="success"
        variant="subtle"
        icon="i-lucide-check"
        data-test="already-marked"
        title="This register has been marked"
        description="The records are made. Correcting one now is a revocation and a re-grant, not a second mark."
      />

      <template v-else-if="!open">
        <UAlert
          color="neutral"
          variant="subtle"
          icon="i-lucide-lock"
          title="The register is not open yet"
          description="Opening it closes sign-up and freezes what this session teaches. It opens on the day, not before."
        />
        <UButton
          size="xl"
          block
          :loading="working"
          data-test="open-register"
          @click="openRegister"
        >
          Open the register
        </UButton>
      </template>

      <template v-else>
        <p
          class="text-sm text-muted"
          data-test="marking-help"
        >
          Everybody starts absent. Tap somebody to mark them present. Marking is what creates the
          records, so nothing is awarded until you submit.
        </p>

        <ul
          class="space-y-2"
          data-test="register-list"
        >
          <li
            v-for="one in attendees"
            :key="one.userId"
          >
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-lg border p-4 text-left transition-colors"
              :class="present.has(one.userId)
                ? 'border-primary bg-primary/10'
                : 'border-default'"
              :aria-pressed="present.has(one.userId)"
              :data-test="`mark-${one.userId}`"
              @click="toggle(one.userId)"
            >
              <span>
                <span class="text-base font-medium">{{ one.name }}</span>
                <UBadge
                  v-if="one.source === 'WALK_IN'"
                  class="ml-2"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  Walk-in
                </UBadge>
              </span>
              <UIcon
                :name="present.has(one.userId) ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                class="size-6 shrink-0"
                :class="present.has(one.userId) ? 'text-primary' : 'text-muted'"
              />
            </button>
          </li>
        </ul>

        <p
          v-if="attendees.length === 0"
          class="py-6 text-center text-sm text-muted"
          data-test="register-empty"
        >
          Nobody is on this register. Add whoever turned up before you submit it.
        </p>

        <UAlert
          v-if="confirmingAllAbsent"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          data-test="all-absent-warning"
          title="Nobody is marked present"
          description="Submitting now awards nothing at all, and everybody on the register is emailed to say we missed them. Submit again if that is right."
        />

        <div class="sticky bottom-4 space-y-2">
          <UButton
            size="xl"
            block
            :loading="working"
            :color="confirmingAllAbsent ? 'warning' : 'primary'"
            data-test="submit-register"
            @click="submit"
          >
            {{ confirmingAllAbsent
              ? 'Submit with nobody present'
              : `Submit: ${plural(presentCount, 'person', 'people')} present` }}
          </UButton>
        </div>
      </template>
    </template>
  </div>
</template>
