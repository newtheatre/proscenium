<!-- Who the tickets are emailed to at the till. The seller finds the buyer by name or address, as
     the person picker does (this box only: Matt, 17 November), which shows a name and enough to tell
     two people apart. Or they type an address and choose "Use" it; after a name with no @, or part
     of a provider, the box offers it at each common provider (box-office.till.email-domains). The
     order then joins the account for that address, made unclaimed if there is none. The value is
     the picked account's id or the address; nothing else about the buyer is shown. -->
<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'

export type Buyer = { accountId: string, label: string } | { email: string }
interface Person { id: string, label: string, since: number, claimed: boolean, disabled: boolean }
interface Item { id: string, label: string, description?: string, icon?: string, buyer: Buyer }

const props = defineProps<{ domains: string[], disabled?: boolean, placeholder?: string }>()
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

// What to offer to use: the address as typed when it is whole, and the typed name at each common
// provider that fits what comes after any @ so far.
const MOST_SUGGESTED = 5 // not-policy: a short list under the search results
const addresses = computed(() => {
  const text = typed.value
  const at = text.indexOf('@')
  const local = at < 0 ? text : text.slice(0, at)
  if (!local || /\s/.test(local) || text.split('@').length > 2) return []
  const partial = at < 0 ? '' : text.slice(at + 1).toLowerCase()
  const offered = looksLikeAddress(text) ? [text] : []
  for (const domain of props.domains) {
    if (offered.length >= MOST_SUGGESTED) break
    if (domain.toLowerCase().startsWith(partial) && domain.toLowerCase() !== partial) offered.push(`${local}@${domain}`)
  }
  return offered
})

const idOf = (buyer: Buyer) => 'accountId' in buyer ? `account:${buyer.accountId}` : `address:${buyer.email.toLowerCase()}`
const describe = (p: Person) => [
  p.claimed ? t('core.picker.since', { date: monthYear(p.since) }) : t('core.picker.unclaimed'),
  p.disabled ? t('core.picker.disabled') : null,
].filter(Boolean).join(', ')

const items = computed<Item[]>(() => {
  const list: Item[] = found.value.map(p => ({ id: `account:${p.id}`, label: p.label, description: describe(p), icon: 'i-lucide-user-round', buyer: { accountId: p.id, label: p.label } }))
  for (const address of addresses.value) {
    list.push({ id: `address:${address.toLowerCase()}`, label: t('box-office.screens.panel.buyer.use', { address }), icon: 'i-lucide-mail', buyer: { email: address } })
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
  if (q.length < SEARCH_FROM) {
    found.value = []
    loading.value = false
    return
  }
  loading.value = true
  failed.value = false
  try {
    const answer = await $api<{ people: Person[] }>('/api/box-office/desk/buyers', { query: { q } })
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
      :placeholder="placeholder ?? t('box-office.screens.panel.buyer.placeholder')"
      :search-input="{ placeholder: t('box-office.screens.panel.buyer.search'), icon: 'i-lucide-search' }"
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
        >{{ placeholder ?? t('box-office.screens.panel.buyer.placeholder') }}</span>
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
