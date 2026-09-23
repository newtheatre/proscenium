<script setup lang="ts">
import { saysDay } from '#shared/utils/when'
import type { AnnounceShowOption as ShowOption } from '#shared/utils/announcements'

// A show is chosen by its title, never typed as an id (0032), and arrives with its performances
// so a performance can be picked from the run without a second search.

interface Listing { items: ShowOption[] }

interface Item {
  label: string
  value: string
  show: ShowOption
}

const model = defineModel<string | undefined>()
const emit = defineEmits<{ chosen: [show: ShowOption | null] }>()

const chosen = ref<Item | null>(null)
const searchTerm = ref('')
const settled = useDebounced(searchTerm, 250)

const instance = useId()
// Plain $fetch builds an event with no platform context, so the session password never reaches it
// and the render is refused (K-131).
const request = useRequestFetch()
const { data, status } = await useAsyncData(
  () => `show-picker-${instance}-${settled.value}`,
  () => settled.value.trim().length < 2
    ? Promise.resolve({ items: [] } as Listing)
    : request<Listing>('/api/admin/comms/announce-shows', { query: { q: settled.value.trim() } }),
  { watch: [settled], default: (): Listing => ({ items: [] }), getCachedData: () => undefined },
)

function saysRun(show: ShowOption): string {
  const first = show.performances[0]
  const last = show.performances.at(-1)
  if (!first || !last) return show.title
  const opens = saysDay(first.startsAt, { year: true })
  const closes = saysDay(last.startsAt, { year: true })
  return opens === closes ? `${show.title}, ${opens}` : `${show.title}, ${opens} to ${closes}`
}

const items = computed<Item[]>(() => (data.value?.items ?? []).map(show => ({
  label: saysRun(show),
  value: show.id,
  show,
})))

const shown = computed<Item[]>(() =>
  chosen.value && !items.value.some(item => item.value === chosen.value!.value)
    ? [chosen.value, ...items.value]
    : items.value)

function choose(item: Item | undefined): void {
  chosen.value = item ?? null
  model.value = item?.value
  emit('chosen', item?.show ?? null)
}

// A form that resets its state clears the resolved show too.
watch(model, (value) => {
  if (!value) chosen.value = null
})
</script>

<template>
  <div
    class="space-y-2"
    data-test="show-picker"
  >
    <UInputMenu
      class="w-full"
      :model-value="shown.find(item => item.value === model)"
      :items="shown"
      :loading="status === 'pending'"
      placeholder="Search by title"
      :search-input="{ icon: 'i-lucide-search', placeholder: 'Title' }"
      :content="{ hideWhenEmpty: true }"
      ignore-filter
      icon="i-lucide-drama"
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
      data-test="show-picker-resolved"
    >
      {{ chosen.label }}
    </p>
  </div>
</template>
