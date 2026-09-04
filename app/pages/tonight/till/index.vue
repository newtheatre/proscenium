<script setup lang="ts">
import { londonClock } from '#shared/utils/london'
import type { TillSession } from '#shared/utils/till'

definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Till' })

// The guard is the route's, not this screen's: what a refusal says is written where it is
// raised, so this only ever displays it (E-111 criterion 5).
const request = useRequestFetch()
const syncedAt = ref<Date | null>(null)
const failure = ref<string | null>(null)
const busy = ref(false)
const session = ref<TillSession | null>(null)

async function load(): Promise<void> {
  busy.value = true
  failure.value = null
  try {
    const status = await request<{ night: string, venueId: string, session: TillSession | null }>('/api/till')
    session.value = status.session
    syncedAt.value = new Date()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    busy.value = false
  }
}

async function open(): Promise<void> {
  busy.value = true
  failure.value = null
  try {
    const opened = await request<{ session: TillSession }>('/api/till', { method: 'POST', body: {} })
    session.value = opened.session
    syncedAt.value = new Date()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    busy.value = false
  }
}

async function close(): Promise<void> {
  if (!session.value) return
  busy.value = true
  failure.value = null
  try {
    const closed = await request<{ session: TillSession }>('/api/till/close', {
      method: 'POST',
      body: { id: session.value.id },
    })
    session.value = closed.session
    syncedAt.value = new Date()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <NightScreen
    title="Till"
    hint="Opening the till is one session for the whole night. Everyone at this venue sells against it."
    :stale="syncedAt"
    :busy="busy"
  >
    <UAlert
      v-if="failure"
      data-test="till-failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <p
      v-else-if="session"
      data-test="till-open"
    >
      Open since {{ londonClock(new Date(session.openedAt * 1000)) }}.
    </p>

    <p
      v-else
      data-test="till-closed"
    >
      The till is not open yet.
    </p>

    <template #actions>
      <NightAction
        v-if="session"
        label="Close till"
        icon="i-lucide-lock"
        color="error"
        :loading="busy"
        @press="close"
      />
      <NightAction
        v-else
        label="Open till"
        icon="i-lucide-lock-open"
        :loading="busy"
        @press="open"
      />
    </template>
  </NightScreen>
</template>
