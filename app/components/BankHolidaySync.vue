<script setup lang="ts">
import { saysDay, saysWhenLong } from '#shared/utils/when'
import { SYNC_FAILURE_TEXT } from '#shared/utils/bank-holidays'
import { londonDate } from '#shared/utils/working-days'
import type { SyncStanding } from '#shared/utils/bank-holidays'

// The bank holiday card's body: the list read-only, when gov.uk last supplied it and why it last
// failed, and Sync now. Nobody types these dates (C-121 criteria 4 and 8, 0092).
const props = defineProps<{ dates: string[] }>()
const emit = defineEmits<{ synced: [] }>()

const standing = ref<SyncStanding | null>(null)
const syncing = ref(false)
const problem = ref('')

const upcoming = computed(() => {
  const today = londonDate(new Date())
  return [...props.dates].sort().filter(date => date >= today)
})

const says = computed(() => {
  const sync = standing.value
  if (!sync) return null
  const last = sync.syncedAt ? `Last copied from gov.uk on ${saysWhenLong(sync.syncedAt)}.` : 'Not yet copied from gov.uk: these are the dates the system shipped with.'
  if (sync.status === 'failed' && sync.failedAt) {
    const why = sync.failure ? SYNC_FAILURE_TEXT[sync.failure] : 'it failed'
    return { color: 'error' as const, text: `The last copy, on ${saysWhenLong(sync.failedAt)}, failed: ${why}. The list below still stands. ${last}` }
  }
  if (sync.status === 'stale') return { color: 'warning' as const, text: `${last} It should have been copied again since.` }
  return { color: 'neutral' as const, text: last }
})

async function load(): Promise<void> {
  standing.value = await $fetch<SyncStanding>('/api/admin/bank-holidays')
}

async function syncNow(): Promise<void> {
  syncing.value = true
  problem.value = ''
  try {
    await $fetch('/api/admin/bank-holidays/sync', { method: 'POST' })
    emit('synced')
  }
  catch (error) {
    problem.value = refusalText(error)
  }
  finally {
    syncing.value = false
    await load().catch(() => undefined)
  }
}

onMounted(() => load().catch((error) => {
  problem.value = refusalText(error)
}))
</script>

<template>
  <div
    class="space-y-3"
    data-test="bank-holiday-sync"
  >
    <UAlert
      v-if="says"
      :color="says.color"
      variant="subtle"
      :description="says.text"
      data-test="bank-holiday-sync-status"
    />
    <UAlert
      v-if="problem"
      color="error"
      variant="subtle"
      :description="problem"
    />

    <div class="flex flex-wrap gap-1">
      <UBadge
        v-for="date in upcoming"
        :key="date"
        color="neutral"
        variant="subtle"
        size="sm"
      >
        {{ saysDay(date, { year: true }) }}
      </UBadge>
      <span
        v-if="!upcoming.length"
        class="text-sm text-muted"
      >No dates from today onwards.</span>
    </div>

    <UButton
      color="neutral"
      variant="outline"
      icon="i-lucide-refresh-cw"
      :loading="syncing"
      data-test="bank-holiday-sync-now"
      @click="syncNow"
    >
      Sync now
    </UButton>
  </div>
</template>
