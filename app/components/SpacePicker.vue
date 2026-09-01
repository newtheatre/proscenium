<script setup lang="ts">
// A room somebody else manages, chosen rather than typed. Searched on the server, because there
// hundreds of rooms and a dropdown holding all of them is a page nobody can use (C-119).

interface Space {
  id: string
  name: string
  campus: string | null
  building: string | null
  capacity: number | null
  verdict: string | null
  warning: string | null
}

const model = defineModel<string | undefined>()

const props = withDefaults(defineProps<{
  // What the room is wanted for, so each result can say whether it suits.
  purpose?: string | null
  placeholder?: string
  disabled?: boolean
}>(), { purpose: null, placeholder: 'Search for a room', disabled: false })

const instance = useId()
const searchTerm = ref('')
const settled = useDebounced(searchTerm, 250)
const chosen = ref<Space | null>(null)

const { data, status } = await useAsyncData(
  () => `space-picker-${instance}-${settled.value}-${props.purpose ?? ''}`,
  () => (settled.value.trim().length < 2
    ? Promise.resolve({ items: [] as Space[] })
    : $fetch<{ items: Space[] }>('/api/rooms/external-spaces', {
        query: { search: settled.value, purpose: props.purpose ?? undefined },
      })),
  {
    watch: [settled, () => props.purpose],
    default: (): { items: Space[] } => ({ items: [] }),
    // Never cached: a remembered answer would offer a room since retired, or the old verdict.
    getCachedData: () => undefined,
  },
)

const shown = computed(() => {
  const items = data.value.items
  if (chosen.value && !items.some(item => item.id === chosen.value!.id)) return [chosen.value, ...items]
  return items
})

const options = computed(() => shown.value.map(space => ({ ...space, value: space.id, label: space.name })))

function choose(option: { value: string } | undefined): void {
  model.value = option?.value
  chosen.value = shown.value.find(space => space.id === option?.value) ?? null
}

// The warning follows the chosen room and the purpose, so changing either re-asks.
const warning = computed(() => shown.value.find(space => space.id === model.value)?.warning ?? null)

function where(space: Space): string {
  return [space.building, space.campus].filter(Boolean).join(', ') || 'Somewhere on campus'
}
</script>

<template>
  <div class="space-y-2">
    <UInputMenu
      class="w-full"
      :model-value="options.find(option => option.value === model)"
      :items="options"
      :loading="status === 'pending'"
      :disabled="disabled"
      :placeholder="placeholder"
      :search-input="{ icon: 'i-lucide-search', placeholder: 'A room, a building or a campus' }"
      :content="{ hideWhenEmpty: true }"
      ignore-filter
      icon="i-lucide-map-pin"
      data-test="space-picker"
      @update:model-value="choose"
      @update:search-term="value => searchTerm = value"
    >
      <template #item-label="{ item }">
        <div class="flex flex-wrap items-center gap-2">
          <span>{{ item.name }}</span>
          <span class="text-xs text-muted">{{ where(item) }}</span>
          <UBadge
            v-if="item.verdict && item.verdict !== 'SUITABLE'"
            :color="item.verdict === 'UNSUITABLE' ? 'error' : 'warning'"
            variant="subtle"
            size="sm"
          >
            {{ item.verdict === 'UNSUITABLE' ? 'No good for this' : 'May not suit' }}
          </UBadge>
        </div>
      </template>

      <template #empty>
        <span class="text-sm text-muted">
          {{ searchTerm.trim().length < 2 ? 'Type at least two characters' : 'No room matches that' }}
        </span>
      </template>
    </UInputMenu>

    <UAlert
      v-if="warning"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="warning"
      data-test="space-warning"
    />
  </div>
</template>
