<script setup lang="ts">
import { formatLondon, startOfLondonDay } from '#shared/utils/london'

// H-924: a session is chosen, never typed (0032). Searches what it teaches and its date.

interface SessionOption {
  id: string
  title: string
  heldOn: string
  startsAt: string
}

interface Listing { items: SessionOption[] }

interface Item {
  label: string
  value: string
  heldOn: string
  startsAt: string
}

const model = defineModel<string | undefined>()

withDefaults(defineProps<{
  placeholder?: string
  disabled?: boolean
}>(), {
  placeholder: 'Search by what it teaches or its date',
  disabled: false,
})

const chosen = ref<Item | null>(null)
const searchTerm = ref('')
const settled = useDebounced(searchTerm, 250)

const instance = useId()
// Plain $fetch builds an event with no platform context, so the session password never reaches it
// and the render is refused (K-131).
const request = useRequestFetch()
const { data, status } = await useAsyncData(
  () => `session-picker-${instance}-${settled.value}`,
  () => settled.value.trim().length < 2
    ? Promise.resolve({ items: [] } as Listing)
    : request<Listing>('/api/admin/comms/announce-sessions', { query: { q: settled.value.trim() } }),
  { watch: [settled], default: (): Listing => ({ items: [] }), getCachedData: () => undefined },
)

function saysWhen(heldOn: string, startsAt: string): string {
  return `${formatLondon(startOfLondonDay(heldOn), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, ${startsAt}`
}

const items = computed<Item[]>(() => (data.value?.items ?? []).map(session => ({
  label: `${session.title}, ${saysWhen(session.heldOn, session.startsAt)}`,
  value: session.id,
  heldOn: session.heldOn,
  startsAt: session.startsAt,
})))

const shown = computed<Item[]>(() =>
  chosen.value && !items.value.some(item => item.value === chosen.value!.value)
    ? [chosen.value, ...items.value]
    : items.value)

function choose(item: Item | undefined): void {
  chosen.value = item ?? null
  model.value = item?.value
}

// A form that resets its state clears the resolved session too.
watch(model, (value) => {
  if (!value) chosen.value = null
})
</script>

<template>
  <div
    class="space-y-2"
    data-test="session-picker"
  >
    <UInputMenu
      class="w-full"
      :model-value="shown.find(item => item.value === model)"
      :items="shown"
      :loading="status === 'pending'"
      :disabled="disabled"
      :placeholder="placeholder"
      :search-input="{ icon: 'i-lucide-search', placeholder: 'Title or date' }"
      :content="{ hideWhenEmpty: true }"
      ignore-filter
      icon="i-lucide-calendar-days"
      @update:model-value="choose"
      @update:search-term="value => searchTerm = value"
    >
      <template #empty>
        <span class="text-sm text-muted">
          {{ searchTerm.trim().length < 2 ? 'Type at least two characters' : 'Nothing matches that' }}
        </span>
      </template>
    </UInputMenu>

    <p
      v-if="chosen"
      class="text-sm text-muted"
      data-test="session-picker-resolved"
    >
      {{ chosen.label }}
    </p>
  </div>
</template>
