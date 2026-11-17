<!-- The bar's panel in the till (S2): the outlet's products at its prices, grouped by category, each
     added with one press and counted with a stepper. The till adds the basket to anything else being
     paid for and takes one payment; the bar sale is written only when payment starts. With `large`
     (the combined till in live mode) products are big tiles for a phone or tablet; otherwise a
     compact list beside the desk's other panels. A product that needs an age check says so. -->
<script setup lang="ts">
interface Item { variantId: string, productId: string, product: string, variant: string, ageRestricted: boolean, amountMinor: number }
interface Menu { outletId: string, outlet: string, priceListId: string, priceList: string, categories: { id: string, name: string, colour: string | null, items: Item[] }[] }
interface Outlet { id: string, name: string, kind: string }

const props = defineProps<{ modelValue: unknown, locked: boolean, summary: { lines: { label: string, amountMinor: number }[], amountMinor: number } | null, large?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [unknown] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { toRefusal } = useRefusal()

const DEVICE_OUTLET = 'bar.till.outlet'
const { data: places } = await useAPI<{ outlets: Outlet[] }>('/api/bar/till/outlets', { key: 'bar:till-outlets' })
const outletId = ref<string | undefined>(undefined)
onMounted(() => {
  let kept: string | null = null
  try {
    kept = localStorage.getItem(DEVICE_OUTLET)
  }
  catch {
    // Storage blocked: the first outlet is chosen.
  }
  const list = places.value?.outlets ?? []
  outletId.value = list.find(o => o.id === kept)?.id ?? list[0]?.id
})
const outletItems = computed(() => (places.value?.outlets ?? []).map(o => ({ value: o.id, label: o.name })))

const menu = ref<Menu | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(outletId, async (id) => {
  if (!id) return
  try {
    localStorage.setItem(DEVICE_OUTLET, id)
  }
  catch {
    // Storage blocked: the outlet is asked for again next time.
  }
  refusal.value = null
  try {
    menu.value = await $api<Menu>('/api/bar/till/menu', { query: { outlet: id } })
  }
  catch (e) {
    menu.value = null
    refusal.value = toRefusal(e)
  }
  clear()
})

// The basket: quantities by size, in the order they were first added.
const basket = ref<Map<string, number>>(new Map())
const clientKey = ref(crypto.randomUUID())
const items = computed(() => new Map((menu.value?.categories ?? []).flatMap(c => c.items).map(i => [i.variantId, i])))
const label = (i: Item) => i.variant === 'Each' ? i.product : `${i.product}, ${i.variant}`
const lines = computed(() => [...basket.value].flatMap(([variantId, quantity]) => {
  const item = items.value.get(variantId)
  return item ? [{ item, quantity }] : []
}))
const total = computed(() => lines.value.reduce((s, l) => s + l.item.amountMinor * l.quantity, 0))

function send() {
  if (!lines.value.length || !menu.value) return emit('update:modelValue', null)
  emit('update:modelValue', {
    outletId: menu.value.outletId,
    clientKey: clientKey.value,
    lines: lines.value.map(l => ({ variantId: l.item.variantId, quantity: l.quantity })),
    expectedTotalMinor: total.value,
  })
}
function set(variantId: string, quantity: number) {
  const next = new Map(basket.value)
  if (quantity <= 0) next.delete(variantId)
  else next.set(variantId, quantity)
  basket.value = next
  send()
}
const add = (i: Item) => set(i.variantId, (basket.value.get(i.variantId) ?? 0) + 1)
function clear() {
  basket.value = new Map()
  send()
}

// The till empties every panel after a payment: start a new basket, with a new key.
watch(() => props.modelValue, (value) => {
  if (value === null && basket.value.size) {
    basket.value = new Map()
    clientKey.value = crypto.randomUUID()
  }
})

const category = ref<string | undefined>(undefined)
watch(menu, (m) => { category.value = m?.categories[0]?.id })
const categoryItems = computed(() => (menu.value?.categories ?? []).map(c => ({ value: c.id, label: c.name })))
const shown = computed(() => props.large ? menu.value?.categories.filter(c => c.id === category.value) ?? [] : menu.value?.categories ?? [])
</script>

<template>
  <div class="space-y-4">
    <RefusalNotice :refusal="refusal" />
    <p
      v-if="places && !places.outlets.length"
      class="text-sm text-muted"
    >
      {{ t('bar.desk.no-outlet') }}
    </p>
    <UFormField
      v-else-if="outletItems.length > 1"
      :label="t('bar.desk.outlet')"
    >
      <USelect
        v-model="outletId"
        :items="outletItems"
        :disabled="locked || lines.length > 0"
      />
    </UFormField>

    <template v-if="menu">
      <p
        v-if="!menu.categories.length"
        class="text-sm text-muted"
      >
        {{ t('bar.desk.empty-menu') }}
      </p>
      <UTabs
        v-if="large && menu.categories.length > 1"
        v-model="category"
        :items="categoryItems"
        :content="false"
      />
      <div
        v-for="c in shown"
        :key="c.id"
        class="space-y-2"
      >
        <h3
          v-if="!large"
          class="text-sm font-medium text-muted"
        >
          {{ c.name }}
        </h3>
        <div
          v-if="large"
          class="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          <UButton
            v-for="i in c.items"
            :key="i.variantId"
            color="neutral"
            variant="outline"
            size="xl"
            class="flex h-20 flex-col items-start justify-center"
            :disabled="locked"
            @click="add(i)"
          >
            <span class="font-medium">{{ label(i) }}</span>
            <span class="text-sm text-muted">{{ money(i.amountMinor) }}{{ i.ageRestricted ? ` · ${t('bar.desk.age-check')}` : '' }}</span>
          </UButton>
        </div>
        <RecordList
          v-else
          :label="c.name"
        >
          <RecordListItem
            v-for="i in c.items"
            :key="i.variantId"
            :name="label(i)"
            :description="[money(i.amountMinor), i.ageRestricted ? t('bar.desk.age-check') : null].filter(Boolean).join(' · ')"
          >
            <UInputNumber
              :model-value="basket.get(i.variantId) ?? 0"
              :min="0"
              :max="99"
              :disabled="locked"
              :aria-label="t('bar.desk.how-many', { name: label(i) })"
              class="w-28"
              @update:model-value="(v: number | null) => set(i.variantId, v ?? 0)"
            />
          </RecordListItem>
        </RecordList>
      </div>

      <div
        v-if="large && lines.length"
        class="space-y-2"
      >
        <RecordList :label="t('bar.desk.basket')">
          <RecordListItem
            v-for="l in lines"
            :key="l.item.variantId"
            :name="label(l.item)"
            :description="money(l.item.amountMinor * l.quantity)"
          >
            <UInputNumber
              :model-value="l.quantity"
              :min="0"
              :max="99"
              :disabled="locked"
              :aria-label="t('bar.desk.how-many', { name: label(l.item) })"
              class="w-32"
              @update:model-value="(v: number | null) => set(l.item.variantId, v ?? 0)"
            />
          </RecordListItem>
        </RecordList>
      </div>
      <UButton
        v-if="lines.length"
        color="neutral"
        variant="link"
        :label="t('bar.desk.clear')"
        :disabled="locked"
        @click="clear()"
      />
    </template>
  </div>
</template>
