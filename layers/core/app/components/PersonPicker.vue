<!-- The person picker (identity spec part 6, rule 3; `searchAccounts`): a person is chosen, never
     typed. It searches by name or full address as the user types, two characters or more, and shows
     only a name and enough to tell two people apart, never contact details. Unclaimed accounts are
     found too. The value is the chosen account's id. Needs core.account.search. -->
<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'

export interface PickedPerson { id: string, label: string, name: string | null, since: number, claimed: boolean, disabled: boolean }

const props = defineProps<{ placeholder?: string, exclude?: string[], disabled?: boolean }>()
const model = defineModel<string | undefined>()
const emit = defineEmits<{ picked: [person: PickedPerson | undefined] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const term = ref('')
const found = ref<PickedPerson[]>([])
const chosen = ref<PickedPerson | undefined>()
const loading = ref(false)
const failed = ref(false)

const { monthYear: year } = useDates()
const describe = (p: PickedPerson) => [
  p.claimed ? t('core.picker.since', { date: year(p.since) }) : t('core.picker.unclaimed'),
  p.disabled ? t('core.picker.disabled') : null,
].filter(Boolean).join(', ')

const items = computed(() => {
  const list = found.value.filter(p => !props.exclude?.includes(p.id))
  const all = chosen.value && !list.some(p => p.id === chosen.value!.id) ? [chosen.value, ...list] : list
  return all.map(p => ({ ...p, description: describe(p) }))
})

let latest = 0
async function search(q: string) {
  const asked = ++latest
  if (q.trim().length < 3) {
    found.value = []
    loading.value = false
    return
  }
  loading.value = true
  failed.value = false
  try {
    const answer = await $api<{ people: PickedPerson[] }>('/api/core/accounts', { query: { q: q.trim() } })
    if (asked === latest) found.value = answer.people
  }
  catch {
    if (asked === latest) failed.value = true
  }
  finally {
    if (asked === latest) loading.value = false
  }
}
watchDebounced(term, q => search(q), { debounce: 250 }) // not-policy: a pause in typing

watch(model, (id) => {
  chosen.value = id ? items.value.find(p => p.id === id) ?? chosen.value : undefined
  emit('picked', chosen.value)
})
</script>

<template>
  <USelectMenu
    v-model="model"
    v-model:search-term="term"
    :items="items"
    value-key="id"
    label-key="label"
    description-key="description"
    ignore-filter
    :loading="loading"
    :disabled="disabled"
    :placeholder="placeholder ?? t('core.picker.placeholder')"
    :search-input="{ placeholder: t('core.picker.search'), icon: 'i-lucide-search' }"
    icon="i-lucide-user-round"
    :ui="{ placeholder: 'text-muted' }"
  >
    <template #empty>
      {{ failed ? t('core.picker.failed') : term.trim().length < 3 ? t('core.picker.type-more') : t('core.picker.none') }}
    </template>
  </USelectMenu>
</template>
