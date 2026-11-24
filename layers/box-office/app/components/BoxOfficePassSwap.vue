<!-- Swapping tickets for a pass, on Choose tickets (mock-up approved by Matt, 18 November). A moment
     after the ticket counts settle, a row appears for each kind of ticket chosen that a pass price is
     offered instead of: how many of those tickets become passes, each pass's first entry being
     tonight, at the difference in price. Only while the pass works out cheaper a show than the
     ticket and covers more shows still to come. Each one swapped comes off its ticket's count, and a
     membership number typed for that ticket comes across with it (Matt, 19 November). A price for
     members can be had by typing a membership number for each pass, as for a Member ticket, rather
     than signing in. -->
<script setup lang="ts">
import type { PassOnSale } from './BoxOfficePassOffer.vue'

export interface PassSwap { passTypeId: string, passPriceId: string, ticketTypeId: string, name: string, priceName: string, amountMinor: number, count: number, references: string[], /** The part of the house each swapped ticket came from, so it goes back there. */ bands?: string[] }
interface Chosen { ticketTypeId: string, name: string, amountMinor: number, quantity: number }
interface Row { key: string, pass: PassOnSale, price: PassOnSale['prices'][number], ticket: Chosen, entries: number }

const props = defineProps<{ passes: PassOnSale[], chosen: Chosen[], currency?: string }>()
const swaps = defineModel<PassSwap[]>({ default: () => [] })
/** How many of a kind of ticket to swap: the page takes them off the ticket's count, or gives them back. */
const emit = defineEmits<{ count: [row: Omit<PassSwap, 'count' | 'references' | 'bands'>, count: number] }>()

const { t } = useT()
const { money } = await useMoney()

// The counts as they were a moment ago: the offer waits for the visitor to stop choosing.
const settled = ref<Chosen[]>(props.chosen)
let timer: ReturnType<typeof setTimeout> | undefined
watch(() => props.chosen, (now) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    settled.value = now
  }, 600) // not-policy: a short pause before the offer shows
}, { deep: true })
onBeforeUnmount(() => clearTimeout(timer))

const keyOf = (passTypeId: string, priceId: string, ticketTypeId: string) => `${passTypeId} ${priceId} ${ticketTypeId}`
// The entries a pass gives from tonight: one for each show still to come, unless its uses run out first.
const entriesOf = (pass: PassOnSale) => Math.min(pass.ahead, pass.uses ?? pass.ahead)
const rows = computed<Row[]>(() => settled.value.flatMap(ticket => props.passes.flatMap(pass => pass.prices.flatMap((price) => {
  const entries = entriesOf(pass)
  // More shows to come than tonight's, and cheaper a show than the ticket it replaces.
  if (!price.insteadOf.includes(ticket.ticketTypeId) || pass.ahead < 3 || price.amountMinor >= ticket.amountMinor * entries) return []
  // A price only some people may have is offered to them, or to anyone who can type what proves it.
  if (!price.allowed && !price.reference) return []
  return [{ key: keyOf(pass.id, price.id, ticket.ticketTypeId), pass, price, ticket, entries }]
}))))
const swapOf = (row: Row) => swaps.value.find(s => keyOf(s.passTypeId, s.passPriceId, s.ticketTypeId) === row.key)
const countOf = (row: Row) => swapOf(row)?.count ?? 0
// The most of one kind of ticket that can become passes, less those swapped in another row.
const mostOf = (row: Row) => row.ticket.quantity - swaps.value.filter(s => s.ticketTypeId === row.ticket.ticketTypeId && keyOf(s.passTypeId, s.passPriceId, s.ticketTypeId) !== row.key).reduce((sum, s) => sum + s.count, 0)
function setCount(row: Row, count: number | null) {
  emit('count', { passTypeId: row.pass.id, passPriceId: row.price.id, ticketTypeId: row.ticket.ticketTypeId, name: row.pass.name, priceName: row.price.name, amountMinor: row.price.amountMinor }, Math.max(0, Math.min(count ?? 0, mostOf(row))))
}
function setReference(row: Row, n: number, value: string) {
  const swap = swapOf(row)
  if (!swap) return
  const references = [...swap.references]
  references[n] = value
  swaps.value = swaps.value.map(s => (s === swap ? { ...s, references } : s))
}
// An offer that no longer stands gives its tickets back.
watch(rows, () => {
  for (const s of swaps.value) if (!rows.value.some(r => r.key === keyOf(s.passTypeId, s.passPriceId, s.ticketTypeId))) emit('count', s, 0)
})
const typing = (row: Row) => !row.price.allowed && !!row.price.reference
const passNames = computed(() => [...new Set(rows.value.map(r => r.pass.name))])
const ahead = computed(() => Math.max(...rows.value.map(r => r.pass.ahead)))
const referenceId = useId()
</script>

<template>
  <UCard
    v-if="rows.length"
    :ui="{ body: 'space-y-4' }"
  >
    <div class="flex items-start gap-3">
      <UIcon
        name="i-lucide-sparkles"
        class="mt-0.5 size-5 shrink-0 text-primary"
      />
      <div class="min-w-0 space-y-1">
        <h2 class="font-medium">
          {{ t('box-office.book.swap.title') }}
        </h2>
        <p class="text-sm text-muted">
          {{ passNames.length === 1 ? t('box-office.book.swap.covers', { name: passNames[0]!, count: ahead - 1 }) : t('box-office.book.swap.covers-several') }}
          {{ t('box-office.book.swap.first') }}
        </p>
      </div>
    </div>
    <RecordList class="sm:ms-8">
      <RecordListItem
        v-for="row in rows"
        :key="row.key"
        :name="t('box-office.book.swap.row', { ticket: row.ticket.name, pass: row.pass.name, price: row.price.name })"
        :description="t('box-office.book.swap.terms', { amount: money(row.price.amountMinor, currency), count: row.entries, each: money(Math.round(row.price.amountMinor / row.entries), currency) })"
      >
        <FieldNumber
          :model-value="countOf(row)"
          :min="0"
          :max="mostOf(row)"
          :aria-label="t('box-office.book.swap.how-many', { ticket: row.ticket.name, pass: row.pass.name, price: row.price.name })"
          class="w-28"
          @update:model-value="setCount(row, $event)"
        />
        <template
          v-if="typing(row)"
          #below
        >
          <div class="space-y-2">
            <p class="text-sm text-muted">
              {{ row.price.reference!.label }}
            </p>
            <UInput
              v-for="n in countOf(row)"
              :id="`${referenceId}-${row.key.replaceAll(' ', '-')}-${n}`"
              :key="n"
              :model-value="swapOf(row)?.references[n - 1] ?? ''"
              :aria-label="t('box-office.book.reference', { label: row.price.reference!.field ?? row.price.reference!.label, n })"
              :placeholder="t('box-office.book.reference-placeholder', { n })"
              autocomplete="off"
              maxlength="64"
              class="block w-64"
              @update:model-value="setReference(row, n - 1, String($event))"
            />
          </div>
        </template>
      </RecordListItem>
    </RecordList>
  </UCard>
</template>
