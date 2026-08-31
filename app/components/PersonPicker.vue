<script setup lang="ts">
// A person is chosen, never typed (0032). Searches name, address and student number, because a
// name may not match the SU's record and the address is often personal (0031).

interface Person {
  id: string
  name: string
  email: string
  studentId: string | null
  anonymisedAt: number | null
}

interface Listing { items: Person[] }

interface Item {
  label: string
  value: string
  email: string
  hint: string | null
  erased: boolean
}

const model = defineModel<string | undefined>()

const props = withDefaults(defineProps<{
  placeholder?: string
  disabled?: boolean
  // A tombstone is a real account and a valid target for some things, and never for others.
  includeErased?: boolean
}>(), {
  placeholder: 'Search by name, address or student number',
  disabled: false,
  includeErased: false,
})

const searchTerm = ref('')
const settled = useDebounced(searchTerm, 250)

// The account directory: it already pages and allow-lists its columns. Never cached, because a
// remembered answer would offer somebody since renamed or erased.
const instance = useId()
const { data, status } = await useAsyncData(
  () => `person-picker-${instance}-${settled.value}`,
  () => settled.value.trim().length < 2
    ? Promise.resolve({ items: [] } as Listing)
    : $fetch<Listing>('/api/admin/accounts', {
        query: { search: settled.value.trim(), pageSize: 10, includeAnonymised: props.includeErased },
      }),
  { watch: [settled], default: (): Listing => ({ items: [] }), getCachedData: () => undefined },
)

// Held separately so the chosen person still reads as a name after the search that found them has
// been cleared.
const chosen = ref<Item | null>(null)

const items = computed<Item[]>(() => (data.value?.items ?? []).map(person => ({
  label: person.name,
  value: person.id,
  email: person.email,
  hint: person.studentId,
  erased: person.anonymisedAt !== null,
})))

const shown = computed<Item[]>(() =>
  chosen.value && !items.value.some(item => item.value === chosen.value!.value)
    ? [chosen.value, ...items.value]
    : items.value)

function choose(item: Item | undefined): void {
  chosen.value = item ?? null
  model.value = item?.value
}

// A form that resets its state clears the name too, rather than showing the last person picked.
watch(model, (value) => {
  if (!value) chosen.value = null
})
</script>

<template>
  <div data-test="person-picker">
    <UInputMenu
      class="w-full"
      :model-value="shown.find(item => item.value === model)"
      :items="shown"
      :loading="status === 'pending'"
      :disabled="disabled"
      :placeholder="placeholder"
      :search-input="{ icon: 'i-lucide-search', placeholder: 'Name, address or student number' }"
      :content="{ hideWhenEmpty: true }"
      ignore-filter
      icon="i-lucide-user"
      @update:model-value="choose"
      @update:search-term="value => searchTerm = value"
    >
      <template #item-label="{ item }">
        <span class="flex flex-col">
          <span class="flex items-center gap-1.5">
            {{ item.label }}
            <UBadge
              v-if="item.erased"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              Erased
            </UBadge>
          </span>
          <span class="font-mono text-xs text-muted">{{ item.hint ?? item.email }}</span>
        </span>
      </template>

      <template #empty>
        <span class="text-sm text-muted">
          {{ searchTerm.trim().length < 2 ? 'Type at least two characters' : 'Nobody matches that' }}
        </span>
      </template>
    </UInputMenu>
  </div>
</template>
