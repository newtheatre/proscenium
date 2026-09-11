<script setup lang="ts">
// A person is chosen, never typed (0032). Searches name, address and student number, because a
// name may not match the SU's record and the address is often personal (0031).

interface Person {
  id: string
  name: string
  email: string
  studentId?: string | null
  anonymisedAt?: number | null
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

// The name as well as the id, for a screen building a list of people rather than holding one.
const emit = defineEmits<{ chosen: [{ id: string, name: string } | null] }>()

const props = withDefaults(defineProps<{
  placeholder?: string
  disabled?: boolean
  // A tombstone is a real account and a valid target for some things, and never for others.
  includeErased?: boolean
  // A screen with no accounts.read searches its own scoped route instead (K-123 criterion 1).
  endpoint?: string
  searchParam?: string
}>(), {
  placeholder: 'Search by name, address or student number',
  disabled: false,
  includeErased: false,
  endpoint: '/api/admin/accounts',
  searchParam: 'search',
})

// Held separately so the chosen person still reads as a name after the search that found them has
// been cleared.
const chosen = ref<Item | null>(null)

// A caller that already knows who was chosen, such as fulfilling a request by name, shows them
// without a round trip through search (#940 criterion 3). Exposed before the await below: after
// one, defineExpose no longer attaches to this component's instance.
function preset(person: { id: string, name: string, email: string }): void {
  chosen.value = { label: person.name, value: person.id, email: person.email, hint: null, erased: false }
  model.value = person.id
}

defineExpose({ preset })

const searchTerm = ref('')
const settled = useDebounced(searchTerm, 250)

// The account directory: it already pages and allow-lists its columns. Never cached, because a
// remembered answer would offer somebody since renamed or erased.
const instance = useId()
const { data, status } = await useAsyncData(
  () => `person-picker-${instance}-${settled.value}`,
  // Typed explicitly (0053): inferring it from the route map alone has grown too deep for tsc.
  () => settled.value.trim().length < 2
    ? Promise.resolve({ items: [] } as Listing)
    : $fetch<Listing>(props.endpoint, {
        query: props.endpoint === '/api/admin/accounts'
          ? { [props.searchParam]: settled.value.trim(), pageSize: 10, includeAnonymised: props.includeErased }
          : { [props.searchParam]: settled.value.trim() },
      }),
  { watch: [settled], default: (): Listing => ({ items: [] }), getCachedData: () => undefined },
)

const items = computed<Item[]>(() => (data.value?.items ?? []).map(person => ({
  label: person.name,
  value: person.id,
  email: person.email,
  hint: person.studentId ?? null,
  erased: (person.anonymisedAt ?? null) !== null,
})))

const shown = computed<Item[]>(() =>
  chosen.value && !items.value.some(item => item.value === chosen.value!.value)
    ? [chosen.value, ...items.value]
    : items.value)

function choose(item: Item | undefined): void {
  chosen.value = item ?? null
  model.value = item?.value
  emit('chosen', item ? { id: item.value, name: item.label } : null)
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
