<!-- Passes in the till's box office panel (BO-64; mock-up approved by Matt, 18 November). A pass
     scanned or typed in the find box adds one entry for tonight, with what it still owes; one that
     cannot be used tonight says why, and what it owes can still be paid. A new pass is sold here
     with its first entry tonight, or on its own, to the holder the seller picks. There is no pass
     tile: the find box is the way in. -->
<script setup lang="ts">
import type { Buyer } from './BoxOfficeBuyerPicker.vue'

export interface TillPass { code: string, name: string, priceName: string, holder: string | null, owedMinor: number, left: number | null, unusable: { code: string, reason: string, remedy: string | null } | null }
export interface TillPassBuy { passTypeId: string, passPriceId: string, name: string, priceName: string, amountMinor: number, entry: boolean, holder?: Buyer }
interface OnSale { id: string, name: string, covers: boolean, holder: 'auto' | 'named' | 'open', prices: { id: string, name: string, amountMinor: number, proofNote: string | null, restricted: boolean }[] }

const props = defineProps<{ performanceId: string, locked: boolean }>()
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
const entry = ref(true)
const options = computed(() => onSale.value.flatMap(type => type.prices.map(price => ({
  value: `${type.id} ${price.id}`,
  label: t('box-office.screens.panel.pass.option', { name: type.name, price: price.name, amount: money(price.amountMinor) }),
  description: price.restricted ? price.proofNote ?? t('box-office.screens.panel.pass.check') : undefined,
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
})
async function openSelling() {
  selling.value = true
  saleRefusal.value = null
  try {
    onSale.value = (await $api<{ passes: OnSale[] }>('/api/box-office/desk/passes', { query: { performanceId: props.performanceId } })).passes
    if (options.value.length === 1) chosen.value = options.value[0]!.value
  }
  catch (e) {
    saleRefusal.value = toRefusal(e)
  }
}
function addSale() {
  const c = choice.value
  if (!c || (needsHolder.value && !holder.value)) return
  buys.value = [...buys.value, { passTypeId: c.type.id, passPriceId: c.price.id, name: c.type.name, priceName: c.price.name, amountMinor: c.price.amountMinor, entry: entry.value && c.type.covers, ...(holder.value ? { holder: holder.value } : {}) }]
  closeSelling()
}
function closeSelling() {
  selling.value = false
  chosen.value = undefined
  holder.value = undefined
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
      @click="openSelling"
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
        <UFormField
          :label="t('box-office.screens.panel.pass.holder')"
          :help="needsHolder ? t('box-office.screens.panel.pass.holder-needed') : t('box-office.screens.panel.pass.holder-help')"
        >
          <BoxOfficeBuyerPicker
            v-model="holder"
            :domains="[]"
            :placeholder="t('box-office.screens.panel.pass.holder-placeholder')"
          />
        </UFormField>
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
          :disabled="!choice || (needsHolder && !holder)"
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
