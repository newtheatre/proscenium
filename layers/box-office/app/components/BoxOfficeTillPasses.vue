<!-- Passes in the till's box office panel (BO-64; mock-up approved by Matt, 18 November). A pass
     scanned or typed in the find box adds one entry for tonight, with what it still owes; one that
     cannot be used tonight says why, and what it owes can still be paid. A new pass is sold here
     with its first entry tonight, or on its own, to the holder the seller picks. A price only some
     people may have, such as Member, asks there and then who qualifies (Matt, 19 November): their
     card scanned or the person found and checked, as for a Member ticket, or their reference typed,
     such as a student ID on a verification list. There is no pass tile: the find box is the way in. -->
<script setup lang="ts">
import type { Buyer } from './BoxOfficeBuyerPicker.vue'
import type { Holder } from './BoxOfficeHolderPicker.vue'
import type { CoverChoice } from './BoxOfficePassCoverList.vue'

export interface TillPass { passId?: string, code: string, name: string, priceName: string, holder: string | null, owedMinor: number, left: number | null, unusable: { code: string, reason: string, remedy: string | null } | null }
export interface TillPassBuy { passTypeId: string, passPriceId: string, name: string, priceName: string, amountMinor: number, entry: boolean, holder?: Buyer, /** Typed for a price only some people may have, in place of finding the holder. */ reference?: string, /** Tickets the holder already has, for this pass to cover once the sale is made (Matt, 19 November). */ cover?: string[] }
interface OnSale { id: string, name: string, covers: boolean, holder: 'auto' | 'named' | 'open', uses: number | null, ahead: number, prices: { id: string, name: string, amountMinor: number, proofNote: string | null, restricted: boolean, insteadOf: string[], reference?: { label: string, field?: string, shape: string } }[] }
interface SaleTicket { ticketTypeId: string, name: string, amountMinor: number, quantity: number }

const props = defineProps<{ performanceId: string, locked: boolean, /** The sale's tickets by kind, for the offer to swap one for a pass. */ tickets?: SaleTicket[] }>()
/** A ticket of this kind is to come out of the sale: it became a pass's first entry. */
const emit = defineEmits<{ swap: [ticketTypeId: string] }>()
const entries = defineModel<TillPass[]>('entries', { required: true })
const buys = defineModel<TillPassBuy[]>('buys', { required: true })
const collect = defineModel<TillPass[]>('collect', { required: true })
/** The pass just found, until the next search. */
const found = defineModel<TillPass | null>('found', { required: true })

const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { toRefusal } = useRefusal()

const has = (list: TillPass[], p: TillPass) => list.some(x => x.code === p.code)
const holderOf = (p: TillPass) => p.holder ?? t('box-office.screens.panel.pass.no-holder')
const foundAdded = computed(() => !!found.value && has(entries.value, found.value))
const foundCollecting = computed(() => !!found.value && has(collect.value, found.value))
const foundWords = computed(() => {
  const p = found.value
  if (!p) return ''
  if (p.unusable) return [p.unusable.reason, p.unusable.remedy].filter(Boolean).join(' ')
  const added = foundAdded.value ? t('box-office.screens.panel.pass.added') : t('box-office.screens.panel.pass.removed')
  return p.owedMinor > 0 && foundAdded.value ? `${added} ${t('box-office.screens.panel.pass.owes', { amount: money(p.owedMinor) })}` : added
})
const foundActions = computed(() => {
  const p = found.value
  if (!p || props.locked) return []
  const out: { label: string, color: 'neutral', variant: 'outline' | 'link', onClick: () => void }[] = []
  if (!p.unusable) {
    out.push(foundAdded.value
      ? { label: t('box-office.screens.panel.pass.undo'), color: 'neutral', variant: 'outline', onClick: () => removeEntry(p) }
      : { label: t('box-office.screens.panel.pass.add-again'), color: 'neutral', variant: 'outline', onClick: () => { entries.value = [...entries.value, p] } })
  }
  else if (p.owedMinor > 0 && !foundCollecting.value) {
    out.push({ label: t('box-office.screens.panel.pass.collect', { amount: money(p.owedMinor) }), color: 'neutral', variant: 'outline', onClick: () => { collect.value = [...collect.value, p] } })
  }
  out.push({ label: t('box-office.screens.panel.pass.dismiss'), color: 'neutral', variant: 'link', onClick: () => { found.value = null } })
  return out
})
function removeEntry(p: TillPass) {
  entries.value = entries.value.filter(x => x.code !== p.code)
}
function removeCollect(p: TillPass) {
  collect.value = collect.value.filter(x => x.code !== p.code)
}

// Selling a new pass.
const selling = ref(false)
const onSale = ref<OnSale[]>([])
const saleRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
const chosen = ref<string | undefined>(undefined)
const holder = ref<Buyer | undefined>(undefined)
// For a price only some people may have: the holder found and checked, or their reference typed.
const qualified = ref<Holder | undefined>(undefined)
const reference = ref('')
const entry = ref(true)
const options = computed(() => onSale.value.flatMap(type => type.prices.map(price => ({
  value: `${type.id} ${price.id}`,
  label: t('box-office.screens.panel.pass.option', { name: type.name, price: price.name, amount: money(price.amountMinor) }),
  description: price.restricted ? price.proofNote ?? undefined : undefined,
}))))
const choice = computed(() => {
  const [typeId, priceId] = (chosen.value ?? '').split(' ')
  const type = onSale.value.find(x => x.id === typeId)
  const price = type?.prices.find(p => p.id === priceId)
  return type && price ? { type, price } : null
})
// A pass in one person's name needs them named; an open one may be anyone's.
const needsHolder = computed(() => !!choice.value && (choice.value.type.holder === 'named' || (choice.value.type.holder === 'auto' && choice.value.price.restricted)))
watch(choice, (c) => {
  entry.value = !!c?.type.covers
  qualified.value = undefined
  reference.value = ''
})
const restricted = computed(() => !!choice.value?.price.restricted)
// A price only some people may have needs someone who qualifies, or their reference; a pass in one
// person's name needs them named; an open one may be anyone's.
const ready = computed(() => !!choice.value && (restricted.value ? !!qualified.value || !!reference.value.trim() : !needsHolder.value || !!holder.value))
// Tickets the person found already has for other shows this pass covers, ticked to begin with (Matt, 19 November).
const holderAccount = computed(() => restricted.value ? qualified.value?.accountId : holder.value && 'accountId' in holder.value ? holder.value.accountId : undefined)
const coverChoices = ref<{ choices: CoverChoice[], others: number }>({ choices: [], others: 0 })
const cover = ref<string[]>([])
watch([choice, holderAccount, entry], async () => {
  const c = choice.value
  const accountId = holderAccount.value
  coverChoices.value = { choices: [], others: 0 }
  cover.value = []
  if (!c || !accountId) return
  const found = await $api<{ choices: CoverChoice[], others: number }>('/api/box-office/desk/covers', { query: { performanceId: props.performanceId, passTypeId: c.type.id, passPriceId: c.price.id, accountId, entry: String(entry.value && c.type.covers) } }).catch(() => ({ choices: [], others: 0 }))
  if (choice.value !== c || holderAccount.value !== accountId) return
  coverChoices.value = found
  cover.value = found.choices.map(x => x.lineId)
})
let loadedFor = ''
async function loadOnSale() {
  if (loadedFor === props.performanceId) return
  onSale.value = (await $api<{ passes: OnSale[] }>('/api/box-office/desk/passes', { query: { performanceId: props.performanceId } })).passes
  loadedFor = props.performanceId
}
async function openSelling(prefill?: { value: string, swapping: string }) {
  selling.value = true
  saleRefusal.value = null
  swapping.value = prefill?.swapping ?? null
  try {
    await loadOnSale()
    if (prefill) chosen.value = prefill.value
    else if (options.value.length === 1) chosen.value = options.value[0]!.value
  }
  catch (e) {
    saleRefusal.value = toRefusal(e)
  }
}

// The offer to swap a ticket in the sale for a pass (mock-up approved by Matt, 18 November): one
// button for each kind of ticket a price is offered instead of, while the pass is cheaper a show and
// covers more shows still to come. Not now hides it for the rest of this sale.
const swapping = ref<string | null>(null)
const notNow = ref(false)
watch(() => props.performanceId, () => {
  notNow.value = false
})
watch(() => (props.tickets ?? []).length, (n) => {
  if (!n) notNow.value = false
  else loadOnSale().catch(() => {})
}, { immediate: true })
const swaps = computed(() => (props.tickets ?? []).flatMap(ticket => onSale.value.filter(type => type.covers && type.ahead >= 3).flatMap(type => type.prices.flatMap((price) => {
  const entries = Math.min(type.ahead, type.uses ?? type.ahead)
  if (!price.insteadOf.includes(ticket.ticketTypeId) || price.amountMinor >= ticket.amountMinor * entries) return []
  return [{ ticket, type, price, more: price.amountMinor - ticket.amountMinor }]
}))))
const swapNames = computed(() => [...new Set(swaps.value.map(s => s.type.name))])
const swapActions = computed(() => [
  ...swaps.value.map(s => ({
    label: t('box-office.screens.panel.pass.swap', { ticket: s.ticket.name, pass: s.type.name, price: s.price.name, amount: money(s.more) }),
    color: 'neutral' as const,
    variant: 'outline' as const,
    onClick: () => openSelling({ value: `${s.type.id} ${s.price.id}`, swapping: s.ticket.ticketTypeId }),
  })),
  { label: t('box-office.screens.panel.pass.not-now'), color: 'neutral' as const, variant: 'link' as const, onClick: () => { notNow.value = true } },
])
function addSale() {
  const c = choice.value
  if (!c || !ready.value) return
  const typed = restricted.value && !qualified.value ? reference.value.trim() : ''
  const who: Buyer | undefined = restricted.value ? (qualified.value ? { accountId: qualified.value.accountId, label: qualified.value.label } : holder.value) : holder.value
  buys.value = [...buys.value, { passTypeId: c.type.id, passPriceId: c.price.id, name: c.type.name, priceName: c.price.name, amountMinor: c.price.amountMinor, entry: entry.value && c.type.covers, ...(who ? { holder: who } : {}), ...(typed ? { reference: typed } : {}), ...(cover.value.length ? { cover: cover.value } : {}) }]
  // A swap: the ticket it replaces comes out of the sale, as its entry is the pass's.
  if (swapping.value && entry.value && c.type.covers) emit('swap', swapping.value)
  closeSelling()
}
function closeSelling() {
  selling.value = false
  swapping.value = null
  chosen.value = undefined
  holder.value = undefined
  qualified.value = undefined
  reference.value = ''
}
const buyerLabel = (b: Buyer | undefined) => (!b ? t('box-office.screens.panel.pass.no-holder') : 'email' in b ? b.email : b.label)
</script>

<template>
  <div class="space-y-3">
    <UAlert
      v-if="found"
      :color="found.unusable ? 'warning' : 'success'"
      variant="subtle"
      icon="i-lucide-id-card"
      :title="t('box-office.screens.panel.pass.title', { name: found.name, holder: holderOf(found) })"
      :description="foundWords"
      :actions="foundActions"
    />
    <BoxOfficePassCoverPanel
      v-if="found?.passId && !locked"
      :pass-id="found.passId"
      mode="staff"
      :holder="found.holder"
    />

    <UAlert
      v-if="swaps.length && !notNow && !selling && !locked"
      color="info"
      variant="subtle"
      icon="i-lucide-id-card"
      :title="swapNames.length === 1 ? t('box-office.screens.panel.pass.swap-title', { name: swapNames[0]! }) : t('box-office.screens.panel.pass.swap-title-several')"
      :description="t('box-office.screens.panel.pass.swap-help')"
      :actions="swapActions"
    />

    <ul
      v-if="entries.length || buys.length || collect.length"
      class="space-y-1 text-sm"
      :aria-label="t('box-office.screens.panel.pass.in-sale')"
    >
      <li
        v-for="p in entries"
        :key="`entry-${p.code}`"
        class="flex items-center justify-between gap-2"
      >
        <span>{{ t('box-office.screens.panel.pass.entry-line', { name: p.name, holder: holderOf(p), code: p.code }) }}</span>
        <IconButton
          icon="i-lucide-x"
          size="xs"
          :label="t('box-office.screens.panel.pass.remove', { name: p.name })"
          :disabled="locked"
          @click="removeEntry(p)"
        />
      </li>
      <li
        v-for="(b, i) in buys"
        :key="`buy-${i}`"
        class="flex items-center justify-between gap-2"
      >
        <span>{{ t(b.entry ? 'box-office.screens.panel.pass.buy-line' : 'box-office.screens.panel.pass.buy-line-alone', { name: b.name, price: b.priceName, holder: buyerLabel(b.holder) }) }}</span>
        <IconButton
          icon="i-lucide-x"
          size="xs"
          :label="t('box-office.screens.panel.pass.remove', { name: b.name })"
          :disabled="locked"
          @click="buys = buys.filter((_, n) => n !== i)"
        />
      </li>
      <li
        v-for="p in collect"
        :key="`collect-${p.code}`"
        class="flex items-center justify-between gap-2"
      >
        <span>{{ t('box-office.screens.panel.pass.collect-line', { name: p.name, holder: holderOf(p), amount: money(p.owedMinor) }) }}</span>
        <IconButton
          icon="i-lucide-x"
          size="xs"
          :label="t('box-office.screens.panel.pass.remove', { name: p.name })"
          :disabled="locked"
          @click="removeCollect(p)"
        />
      </li>
    </ul>

    <UButton
      v-if="!selling"
      icon="i-lucide-id-card"
      color="neutral"
      variant="link"
      :label="t('box-office.screens.panel.pass.sell')"
      :disabled="locked"
      @click="openSelling()"
    />
    <div
      v-else
      class="space-y-3 rounded-lg border border-default p-3"
    >
      <h4 class="text-sm font-medium">
        {{ t('box-office.screens.panel.pass.sell') }}
      </h4>
      <RefusalNotice :refusal="saleRefusal" />
      <p
        v-if="!saleRefusal && !options.length"
        class="text-sm text-muted"
      >
        {{ t('box-office.screens.panel.pass.none-on-sale') }}
      </p>
      <template v-else-if="options.length">
        <UFormField :label="t('box-office.screens.panel.pass.which')">
          <USelect
            v-model="chosen"
            :items="options"
            :placeholder="t('box-office.screens.panel.pass.which-placeholder')"
            class="min-w-64"
          />
        </UFormField>
        <div
          v-if="choice && restricted"
          class="space-y-2"
        >
          <BoxOfficeHolderPicker
            v-if="!reference.trim()"
            v-model="qualified"
            :performance-id="performanceId"
            :pass-price-id="choice.price.id"
            :label="t('box-office.screens.panel.pass.qualifies', { price: choice.price.name })"
            :disabled="locked"
          />
          <UInput
            v-if="choice.price.reference && !qualified"
            v-model="reference"
            :aria-label="choice.price.reference.field ?? choice.price.reference.label"
            :placeholder="t('box-office.screens.panel.holder.or-reference', { label: choice.price.reference.field ?? choice.price.reference.label })"
            :disabled="locked"
            autocomplete="off"
            maxlength="64"
            class="block w-64"
          />
        </div>
        <UFormField
          v-if="choice && restricted && !qualified && reference.trim()"
          :label="t('box-office.screens.panel.pass.holder')"
          :help="t('box-office.screens.panel.pass.holder-reference')"
        >
          <BoxOfficeBuyerPicker
            v-model="holder"
            :domains="[]"
            :placeholder="t('box-office.screens.panel.pass.holder-placeholder')"
          />
        </UFormField>
        <UFormField
          v-else-if="!restricted"
          :label="t('box-office.screens.panel.pass.holder')"
          :help="needsHolder ? t('box-office.screens.panel.pass.holder-needed') : t('box-office.screens.panel.pass.holder-help')"
        >
          <BoxOfficeBuyerPicker
            v-model="holder"
            :domains="[]"
            :placeholder="t('box-office.screens.panel.pass.holder-placeholder')"
          />
        </UFormField>
        <div
          v-if="coverChoices.choices.length"
          class="space-y-2"
        >
          <p class="text-sm font-medium">
            {{ t('box-office.covers.till.sell-title', { holder: buyerLabel(restricted ? (qualified ? { accountId: qualified.accountId, label: qualified.label } : holder) : holder) }) }}
          </p>
          <BoxOfficePassCoverList
            v-model="cover"
            :choices="coverChoices.choices"
            :others="coverChoices.others"
            staff
          />
        </div>
        <UCheckbox
          v-model="entry"
          :disabled="!choice?.type.covers"
          :label="t('box-office.screens.panel.pass.entry-tonight')"
          :description="choice && !choice.type.covers ? t('box-office.screens.panel.pass.not-tonight') : undefined"
        />
      </template>
      <div class="flex flex-wrap gap-2">
        <UButton
          :label="t('box-office.screens.panel.pass.add-sale')"
          :disabled="!ready"
          @click="addSale"
        />
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('core.form.cancel')"
          @click="closeSelling"
        />
      </div>
    </div>
  </div>
</template>
