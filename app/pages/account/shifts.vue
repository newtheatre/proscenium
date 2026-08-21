/**
 * The volunteer rota, self-service. A claim is a promise; the reminder the
 * day before is the system keeping its half (docs/12 §3.3).
 */
<script setup lang="ts">
definePageMeta({
  middleware: ['auth'],
  title: 'Shifts',
})

interface Slot {
  id: string
  role: 'DUTY_MANAGER' | 'DOOR' | 'BAR'
  status: 'OPEN' | 'CLAIMED' | 'CONFIRMED' | 'DECLINED'
  holderName: string | null
  performanceId: string
  startsAt: string
  showTitle: string
  venueName: string
  mine: boolean
}

const ROLE_LABELS: Record<Slot['role'], string> = {
  DUTY_MANAGER: 'Duty manager',
  DOOR: 'Door',
  BAR: 'Bar',
}

const requestFetch = useRequestFetch()
const toast = useToast()
const { data, refresh } = await useAsyncData('my-shifts', () => requestFetch<Slot[]>('/api/shifts/mine'))

const slots = computed<Slot[]>(() => data.value ?? [])
const mine = computed(() => slots.value.filter(s => s.mine))

const performances = computed(() => {
  const grouped = new Map<string, { key: string, startsAt: string, showTitle: string, venueName: string, slots: Slot[] }>()
  for (const slot of slots.value) {
    const existing = grouped.get(slot.performanceId)
    if (existing) existing.slots.push(slot)
    else {
      grouped.set(slot.performanceId, {
        key: slot.performanceId,
        startsAt: slot.startsAt,
        showTitle: slot.showTitle,
        venueName: slot.venueName,
        slots: [slot],
      })
    }
  }
  return [...grouped.values()]
})

const busy = ref<string | null>(null)

async function act(slot: Slot, action: 'claim' | 'release') {
  busy.value = slot.id
  try {
    await requestFetch(`/api/shifts/${slot.id}/${action}`, { method: 'POST' })
    await refresh()
  }
  catch (error) {
    toast.add({
      title: action === 'claim' ? 'That shift was not claimed' : 'That shift was not released',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
      color: 'error',
    })
  }
  finally {
    busy.value = null
  }
}
</script>

<template>
  <UContainer class="py-10">
    <h1 class="text-2xl font-semibold">
      Shifts
    </h1>
    <p class="mt-1 text-sm text-muted">
      Front of house runs on volunteers. Take a slot and you are on the rota; you will get a
      reminder the day before.
    </p>

    <UCard
      v-if="mine.length"
      class="mt-6"
    >
      <template #header>
        <p class="font-medium">
          You're on
        </p>
      </template>
      <ul class="divide-y divide-default">
        <li
          v-for="slot in mine"
          :key="slot.id"
          class="flex items-center justify-between gap-3 py-3"
        >
          <div>
            <p class="font-medium">
              {{ slot.showTitle }}
            </p>
            <p class="text-sm text-muted">
              {{ formatDateTime(slot.startsAt) }} · {{ slot.venueName }} · {{ ROLE_LABELS[slot.role] }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UBadge
              :color="slot.status === 'CONFIRMED' ? 'success' : 'warning'"
              variant="soft"
            >
              {{ slot.status.toLowerCase() }}
            </UBadge>
            <UButton
              v-if="slot.status !== 'CONFIRMED'"
              size="xs"
              variant="ghost"
              label="Release"
              :loading="busy === slot.id"
              @click="act(slot, 'release')"
            />
          </div>
        </li>
      </ul>
    </UCard>

    <div class="mt-6 space-y-4">
      <UCard
        v-for="performance in performances"
        :key="performance.key"
      >
        <template #header>
          <p class="font-medium">
            {{ performance.showTitle }}
          </p>
          <p class="text-sm text-muted">
            {{ formatDateTime(performance.startsAt) }} · {{ performance.venueName }}
          </p>
        </template>
        <ul class="divide-y divide-default">
          <li
            v-for="slot in performance.slots"
            :key="slot.id"
            class="flex items-center justify-between gap-3 py-2"
          >
            <span class="flex items-center gap-2">
              <UBadge
                :color="slot.role === 'DUTY_MANAGER' ? 'primary' : 'neutral'"
                variant="subtle"
              >
                {{ ROLE_LABELS[slot.role] }}
              </UBadge>
              <span :class="slot.holderName ? '' : 'text-muted italic'">
                {{ slot.holderName ?? 'Open' }}
              </span>
            </span>
            <UButton
              v-if="slot.status === 'OPEN'"
              size="xs"
              label="Claim"
              :loading="busy === slot.id"
              @click="act(slot, 'claim')"
            />
          </li>
        </ul>
      </UCard>
      <p
        v-if="!performances.length"
        class="text-sm text-muted"
      >
        Nothing on the rota yet.
      </p>
    </div>
  </UContainer>
</template>
