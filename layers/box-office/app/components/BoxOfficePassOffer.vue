<!-- A pass on sale, offered on the Choose tickets page of a show it covers (BO-64; mock-up approved by
     Matt 2026-11-18). Buying it here makes this booking's ticket its first entry, so nobody is sent
     to a separate page to buy a pass before they can book. One of each pass to a booking. -->
<script setup lang="ts">
export interface PassOnSale { id: string, name: string, description: string | null, shows: number | null, once: boolean, uses: number | null, reserveUnpaid: boolean, /** Covered shows still to come, this one included. */ ahead: number, prices: { id: string, name: string, amountMinor: number, proofNote: string | null, allowed: boolean, why: string | null, insteadOf: string[], reference?: { label: string, field?: string, shape: string } }[] }
export interface BoughtPass { passTypeId: string, passPriceId: string, name: string, priceName: string, amountMinor: number, wheelchair: boolean }

const props = defineProps<{ pass: PassOnSale, currency?: string, /** Whether the visitor may book a wheelchair space here. */ wheelchair: boolean }>()
const buying = defineModel<BoughtPass[]>({ default: () => [] })

const { t } = useT()
const { money } = await useMoney()

const mine = computed(() => buying.value.find(b => b.passTypeId === props.pass.id))
const open = props.pass.prices.filter(p => p.allowed)
const picked = ref(mine.value?.passPriceId ?? open[0]?.id)
const from = computed(() => Math.min(...props.pass.prices.map(p => p.amountMinor)))
const items = computed(() => props.pass.prices.map(p => ({
  value: p.id,
  label: `${p.name} · ${money(p.amountMinor, props.currency)}`,
  description: p.allowed ? p.proofNote ?? undefined : p.why === 'sign-in' ? t('box-office.book.pass-offer.sign-in') : p.why && p.why !== 'not-met' ? p.why : t('box-office.book.pass-offer.not-yours'),
  disabled: !p.allowed,
})))
const others = (id: string) => buying.value.filter(b => b.passTypeId !== id)
function put(wheelchair = mine.value?.wheelchair ?? false) {
  const price = props.pass.prices.find(p => p.id === picked.value && p.allowed)
  if (price) buying.value = [...others(props.pass.id), { passTypeId: props.pass.id, passPriceId: price.id, name: props.pass.name, priceName: price.name, amountMinor: price.amountMinor, wheelchair }]
}
// Another price chosen while it is in the basket changes what is in the basket.
watch(picked, () => {
  if (mine.value) put()
})
const remove = () => {
  buying.value = others(props.pass.id)
}
</script>

<template>
  <UCard :ui="{ body: 'space-y-3' }">
    <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <div class="min-w-0">
        <h2 class="font-medium">
          {{ t('box-office.book.pass-offer.title', { name: pass.name, from: money(from, currency) }) }}
        </h2>
        <p class="text-sm text-muted">
          {{ pass.description || (pass.shows && pass.shows > 1 ? t('box-office.book.pass-offer.shows', { count: pass.shows - 1 }) : t('box-office.book.pass-offer.covers')) }}
          {{ t('box-office.book.pass-offer.first') }}
        </p>
      </div>
      <UBadge
        v-if="mine"
        color="success"
        variant="subtle"
        :label="t('box-office.book.pass-offer.in-basket')"
      />
    </div>
    <URadioGroup
      v-model="picked"
      :items="items"
      :legend="t('box-office.book.pass-offer.price')"
      :ui="{ legend: 'sr-only' }"
    />
    <UCheckbox
      v-if="mine && wheelchair"
      :model-value="mine.wheelchair"
      :label="t('box-office.book.pass.wheelchair')"
      :description="t('box-office.book.pass.wheelchair-help')"
      @update:model-value="put($event === true)"
    />
    <div class="flex flex-wrap items-center gap-3">
      <UButton
        v-if="!mine"
        color="neutral"
        variant="outline"
        icon="i-lucide-plus"
        :label="t('box-office.book.pass-offer.add')"
        :disabled="!open.length"
        @click="put()"
      />
      <UButton
        v-else
        color="neutral"
        variant="ghost"
        :label="t('box-office.book.pass-offer.remove')"
        @click="remove"
      />
      <p
        v-if="mine"
        class="text-sm text-muted"
      >
        {{ t('box-office.book.pass-offer.entry') }}
      </p>
    </div>
  </UCard>
</template>
