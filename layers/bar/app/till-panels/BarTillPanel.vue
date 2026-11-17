<!-- The bar's panel in the till (S2): the outlet's products at its prices, grouped by category, each
     added with one press and counted with a stepper. The till adds the basket to anything else being
     paid for and takes one payment; the bar sale is written only when payment starts. With `large`
     (the combined till in live mode) products are big tiles for a phone or tablet; otherwise a
     compact list beside the desk's other panels. The first product that needs an age check asks
     "Does the customer look under 25?" once for the basket; refusing records the reason and takes the
     restricted lines out. A refusal can also be recorded for the whole basket, or with no sale. -->
<script setup lang="ts">
interface Item { variantId: string, productId: string, product: string, variant: string, ageRestricted: boolean, amountMinor: number }
interface Menu { outletId: string, outlet: string, priceListId: string, priceList: string, categories: { id: string, name: string, colour: string | null, items: Item[] }[], ageCheck: { enabled: boolean, challengeAge: number, description: boolean } }
interface Outlet { id: string, name: string, kind: string }

const props = defineProps<{ modelValue: unknown, locked: boolean, summary: { lines: { label: string, amountMinor: number }[], amountMinor: number } | null, large?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [unknown] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { toRefusal } = useRefusal()
const toast = useToast()

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

// The seller's answer to the age prompt, asked once for the basket.
const answer = ref<'not_needed' | 'id_checked' | null>(null)
const restricted = computed(() => lines.value.some(l => l.item.ageRestricted))

function send() {
  if (!lines.value.length || !menu.value) return emit('update:modelValue', null)
  emit('update:modelValue', {
    outletId: menu.value.outletId,
    clientKey: clientKey.value,
    lines: lines.value.map(l => ({ variantId: l.item.variantId, quantity: l.quantity })),
    expectedTotalMinor: total.value,
    ...(restricted.value && answer.value ? { ageCheck: answer.value } : {}),
  })
}

// The prompt: opened by the first restricted product added, holding what to add once answered.
const prompt = ref<{ item: Item, quantity: number } | null>(null)
function needsPrompt(item: Item, quantity: number): boolean {
  if (!menu.value?.ageCheck.enabled || !item.ageRestricted || answer.value || quantity <= 0) return false
  prompt.value = { item, quantity }
  return true
}
function answerPrompt(outcome: 'not_needed' | 'id_checked') {
  const pending = prompt.value!
  prompt.value = null
  answer.value = outcome
  set(pending.item.variantId, pending.quantity)
}

// A refusal: from the prompt (the product that raised it), for the whole basket, or with no sale.
const { data: reasons } = await useAPI<{ terms: { id: string, label: string }[] }>('/api/core/vocabularies/bar.refusal-reason/terms', { key: 'bar:refusal-reasons', default: () => ({ terms: [] }) })
const reasonItems = computed(() => (reasons.value?.terms ?? []).map(r => ({ value: r.id, label: r.label })))
const productItems = computed(() => [...items.value.values()].map(i => ({ value: i.variantId, label: label(i) })))
const refusing = ref<{ variantId: string | undefined, reasonTermId: string | undefined, description: string, from: 'prompt' | 'basket' | 'none' } | null>(null)
const refusalProblem = ref<ReturnType<typeof toRefusal> | null>(null)
const saving = ref(false)
function refuseFromPrompt() {
  refusing.value = { variantId: prompt.value!.item.variantId, reasonTermId: undefined, description: '', from: 'prompt' }
  prompt.value = null
  refusalProblem.value = null
}
function refuseBasket() {
  const first = lines.value.find(l => l.item.ageRestricted) ?? lines.value[0]
  refusing.value = { variantId: first?.item.variantId, reasonTermId: undefined, description: '', from: lines.value.length ? 'basket' : 'none' }
  refusalProblem.value = null
}
async function saveRefusal() {
  const r = refusing.value!
  if (!menu.value || !r.reasonTermId) return
  saving.value = true
  refusalProblem.value = null
  try {
    await $api('/api/bar/age-checks/refusals', {
      method: 'POST',
      body: { outletId: menu.value.outletId, variantId: r.variantId ?? null, reasonTermId: r.reasonTermId, description: menu.value.ageCheck.description && r.description.trim() ? r.description.trim() : null },
    })
    // From the prompt the restricted lines go and the rest of the sale carries on; refusing the basket empties it.
    if (r.from === 'prompt') {
      const next = new Map([...basket.value].filter(([id]) => !items.value.get(id)?.ageRestricted))
      basket.value = next
      send()
    }
    else if (r.from === 'basket') {
      clear()
    }
    refusing.value = null
    toast.add({ title: t('bar.desk.refusal-recorded'), color: 'success' })
  }
  catch (e) {
    refusalProblem.value = toRefusal(e)
  }
  finally {
    saving.value = false
  }
}

function set(variantId: string, quantity: number) {
  const item = items.value.get(variantId)
  if (item && !basket.value.has(variantId) && needsPrompt(item, quantity)) return
  const next = new Map(basket.value)
  if (quantity <= 0) next.delete(variantId)
  else next.set(variantId, quantity)
  basket.value = next
  send()
}
const add = (i: Item) => set(i.variantId, (basket.value.get(i.variantId) ?? 0) + 1)
function clear() {
  basket.value = new Map()
  answer.value = null
  send()
}

// The till empties every panel after a payment: start a new basket, with a new key.
watch(() => props.modelValue, (value) => {
  if (value === null && basket.value.size) {
    basket.value = new Map()
    answer.value = null
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
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="lines.length"
          color="neutral"
          variant="link"
          :label="t('bar.desk.clear')"
          :disabled="locked"
          @click="clear()"
        />
        <UButton
          v-if="menu.ageCheck.enabled"
          color="neutral"
          variant="link"
          :label="lines.length ? t('bar.desk.refuse-sale') : t('bar.desk.record-refusal')"
          :disabled="locked"
          @click="refuseBasket()"
        />
      </div>
    </template>

    <UModal
      :open="!!prompt"
      :title="t('bar.desk.prompt.title', { age: menu?.ageCheck.challengeAge ?? 25 })"
      :description="prompt ? t('bar.desk.prompt.for', { name: label(prompt.item) }) : undefined"
      fullscreen
      @update:open="v => { if (!v) prompt = null }"
    >
      <template #body>
        <div class="mx-auto grid max-w-xl gap-3">
          <UButton
            size="xl"
            block
            :label="t('bar.desk.prompt.over')"
            @click="answerPrompt('not_needed')"
          />
          <UButton
            size="xl"
            block
            color="neutral"
            variant="outline"
            :label="t('bar.desk.prompt.checked')"
            @click="answerPrompt('id_checked')"
          />
          <UButton
            size="xl"
            block
            color="error"
            variant="soft"
            :label="t('bar.desk.refuse-sale')"
            @click="refuseFromPrompt()"
          />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!refusing"
      :title="refusing?.from === 'none' ? t('bar.desk.record-refusal') : t('bar.desk.refuse-sale')"
      @update:open="v => { if (!v) refusing = null }"
    >
      <template #body>
        <UForm
          v-if="refusing"
          id="bar-refusal"
          :state="refusing"
          class="space-y-4"
          @submit="saveRefusal"
        >
          <RefusalNotice :refusal="refusalProblem" />
          <UFormField
            :label="t('bar.desk.refusal.reason')"
            name="reasonTermId"
            required
          >
            <USelect
              v-model="refusing.reasonTermId"
              :items="reasonItems"
              :placeholder="t('bar.desk.refusal.choose-reason')"
            />
          </UFormField>
          <UFormField
            :label="t('bar.desk.refusal.product')"
            name="variantId"
          >
            <USelectMenu
              v-model="refusing.variantId"
              :items="productItems"
              value-key="value"
              :placeholder="t('bar.desk.refusal.no-product')"
            />
          </UFormField>
          <UFormField
            v-if="menu?.ageCheck.description"
            :label="t('bar.desk.refusal.description')"
            :help="t('bar.desk.refusal.description-help')"
            name="description"
          >
            <UTextarea
              v-model="refusing.description"
              :maxlength="120"
              :rows="2"
            />
            <template #hint>
              {{ refusing.description.length }}/120
            </template>
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-refusal"
          color="error"
          :loading="saving"
          :disabled="!refusing?.reasonTermId"
          :label="t('bar.desk.refusal.save')"
        />
      </template>
    </UModal>
  </div>
</template>
