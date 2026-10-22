<script setup lang="ts">
import { saysWaitingListEntry } from '#shared/utils/waiting-list'

// The performance's waiting list at the desk (D-113 criterion 5): who is waiting, in the order they
// would be offered, and a manual offer once seats come back by a route the sweep cannot see.
const props = defineProps<{ performanceId: string }>()

const toast = useToast()

interface Entry {
  id: string
  name: string
  partySize: number
  status: 'WAITING' | 'OFFERED'
  offerExpiresAt: number | null
}

const list = ref<{ summary: { waiting: number, offered: number }, next: Entry[] } | null>(null)
const failure = ref<string | null>(null)
const offering = ref(false)

async function load(): Promise<void> {
  failure.value = null
  try {
    list.value = await $fetch(`/api/box-office/desk/performances/${props.performanceId}/waiting-list`)
  }
  catch (error) {
    list.value = null
    failure.value = refusalText(error, 'The waiting list could not be read.')
  }
}

async function offer(): Promise<void> {
  offering.value = true
  failure.value = null
  try {
    const { offered } = await $fetch<{ offered: number }>(`/api/box-office/desk/performances/${props.performanceId}/waiting-list/offer`, { method: 'POST' })
    toast.add({
      title: offered > 0 ? `Offered to ${plural(offered, 'party', 'parties')}` : 'Nothing offered',
      description: offered > 0 ? 'Each has been emailed first refusal.' : 'No waiting party fits the seats that are free.',
      icon: 'i-lucide-check',
      color: offered > 0 ? 'success' : 'neutral',
    })
    await load()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    offering.value = false
  }
}

watch(() => props.performanceId, () => void load(), { immediate: true })
</script>

<template>
  <UCard data-test="desk-waiting-list">
    <template #header>
      <p class="font-medium">
        Waiting list
      </p>
    </template>
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      :description="failure"
      class="mb-3"
    />
    <template v-if="list">
      <p
        v-if="list.next.length === 0"
        class="text-sm text-muted"
        data-test="desk-waiting-list-empty"
      >
        Nobody is waiting for this performance.
      </p>
      <template v-else>
        <ol class="space-y-2 text-sm">
          <li
            v-for="entry in list.next"
            :key="entry.id"
            class="flex items-baseline justify-between gap-2"
            :data-test="`desk-waiting-list-entry-${entry.id}`"
          >
            <span>{{ entry.name }}</span>
            <span class="text-muted">{{ saysWaitingListEntry(entry) }}</span>
          </li>
        </ol>
        <p class="mt-3 text-xs text-muted">
          Seats freed by a cancel, a refund or a lapse are offered by themselves. Offer by hand only
          after seats come back some other way.
        </p>
        <UButton
          class="mt-3"
          size="sm"
          color="neutral"
          variant="subtle"
          :loading="offering"
          data-test="desk-waiting-list-offer"
          @click="offer"
        >
          Offer free seats now
        </UButton>
      </template>
    </template>
  </UCard>
</template>
