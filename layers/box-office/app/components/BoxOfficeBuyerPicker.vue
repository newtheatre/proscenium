<!-- Who the tickets are emailed to at the till. A seller who may use the person picker
     (core.account.search) finds the buyer by name or address, as the picker does, and shows only a
     name and enough to tell two people apart. Any seller can type a whole address and choose "Use
     it": the order then joins the account for that address, made unclaimed if there is none. The
     value is the picked account's id or the typed address; nothing else about the buyer is shown. -->
<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'

export type Buyer = { accountId: string, label: string } | { email: string }
interface Person { id: string, label: string, since: number, claimed: boolean, disabled: boolean }
interface Item { id: string, label: string, description?: string, icon?: string, buyer: Buyer }

const props = defineProps<{ searchPeople: boolean, disabled?: boolean }>()
const model = defineModel<Buyer | undefined>()

const { t } = useT()
const { $api } = useNuxtApp()
const { monthYear } = useDates()
const term = ref('')
const found = ref<Person[]>([])
const loading = ref(false)
const failed = ref(false)

const SEARCH_FROM = 3 // not-policy: the search index needs three letters
const looksLikeAddress = (text: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
const typed = computed(() => term.value.trim())

const idOf = (buyer: Buyer) => 'accountId' in buyer ? `account:${buyer.accountId}` : `address:${buyer.email.toLowerCase()}`
const describe = (p: Person) => [
  p.claimed ? t('core.picker.since', { date: monthYear(p.since) }) : t('core.picker.unclaimed'),
  p.disabled ? t('core.picker.disabled') : null,
].filter(Boolean).join(', ')

const items = computed<Item[]>(() => {
  const list: Item[] = found.value.map(p => ({ id: `account:${p.id}`, label: p.label, description: describe(p), icon: 'i-lucide-user-round', buyer: { accountId: p.id, label: p.label } }))
  if (looksLikeAddress(typed.value)) {
    list.push({ id: `address:${typed.value.toLowerCase()}`, label: t('box-office.screens.panel.buyer.use', { address: typed.value }), icon: 'i-lucide-mail', buyer: { email: typed.value } })
  }
  // Keep what is chosen in the list, so the menu can still show it after the search moves on.
  const current = model.value
  if (current && !list.some(i => i.id === idOf(current))) {
    list.unshift({ id: idOf(current), label: 'accountId' in current ? current.label : current.email, icon: 'accountId' in current ? 'i-lucide-user-round' : 'i-lucide-mail', buyer: current })
  }
  return list
})

const selected = computed({
  get: () => model.value ? idOf(model.value) : undefined,
  set: (id: string | undefined) => {
    model.value = id ? items.value.find(i => i.id === id)?.buyer : undefined
  },
})
const shown = computed(() => {
  const current = model.value
  return current ? ('accountId' in current ? current.label : current.email) : undefined
})

let latest = 0
async function search(q: string) {
  const asked = ++latest
  if (!props.searchPeople || q.length < SEARCH_FROM) {
    found.value = []
    loading.value = false
    return
  }
  loading.value = true
  failed.value = false
  try {
    const answer = await $api<{ people: Person[] }>('/api/core/accounts', { query: { q } })
    if (asked === latest) found.value = answer.people
  }
  catch {
    if (asked === latest) failed.value = true
  }
  finally {
    if (asked === latest) loading.value = false
  }
}
watchDebounced(typed, q => search(q), { debounce: 250 }) // not-policy: a pause in typing

const empty = computed(() => {
  if (failed.value) return t('core.picker.failed')
  if (!props.searchPeople) return t('box-office.screens.panel.buyer.type-address')
  return typed.value.length < SEARCH_FROM ? t('core.picker.type-more') : t('box-office.screens.panel.buyer.none')
})
</script>

<template>
  <div class="flex items-center gap-2">
    <USelectMenu
      v-model="selected"
      v-model:search-term="term"
      :items="items"
      value-key="id"
      label-key="label"
      description-key="description"
      ignore-filter
      :loading="loading"
      :disabled="disabled"
      :placeholder="t('box-office.screens.panel.buyer.placeholder')"
      :search-input="{ placeholder: searchPeople ? t('box-office.screens.panel.buyer.search') : t('box-office.screens.panel.buyer.address'), icon: 'i-lucide-search' }"
      :icon="model && 'email' in model ? 'i-lucide-mail' : 'i-lucide-user-round'"
      class="flex-1"
      :ui="{ placeholder: 'text-muted' }"
    >
      <template #default>
        <span
          v-if="shown"
          class="truncate"
        >{{ shown }}</span>
        <span
          v-else
          class="truncate text-muted"
        >{{ t('box-office.screens.panel.buyer.placeholder') }}</span>
      </template>
      <template #empty>
        {{ empty }}
      </template>
    </USelectMenu>
    <IconButton
      v-if="model"
      icon="i-lucide-x"
      :label="t('box-office.screens.panel.buyer.clear')"
      :disabled="disabled"
      @click="model = undefined"
    />
  </div>
</template>
