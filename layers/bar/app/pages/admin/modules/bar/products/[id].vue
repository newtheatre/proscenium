<!-- A product (S11): its name, category and age check, and its sizes with a price on each list. A
     price is never edited: setting one writes a new price from now or a later moment, so a sale already
     rung up keeps what it was charged. A size or product that has been sold is retired, not deleted. -->
<script setup lang="ts">
interface VariantPrice { listId: string, amountMinor: number | null, from: 'list' | 'standard' | 'percent' | null, next: { amountMinor: number | null, from: number } | null }
interface Variant { id: string, name: string, barcode: string | null, mixerMeasure: boolean, active: boolean, prices: VariantPrice[] }
interface Product { id: string, categoryId: string, name: string, ageRestricted: boolean, ageFromCategory: boolean, active: boolean, groupIds: string[], variants: Variant[] }
interface List { id: string, name: string, standard: boolean, percentOff: number | null }

const { t } = useT()
const route = useRoute()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { dateTime } = useDates()
const { toRefusal } = useRefusal()
const toast = useToast()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<{ product: Product, categories: { id: string, name: string }[], groups: { id: string, name: string }[], lists: List[], canPrice: boolean, canAllergens: boolean }>(() => `/api/bar/products/${id.value}`, { key: `bar:product:${id.value}` })

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const trail = computed(() => [{ label: t('bar.navigation.products.label'), to: '/admin/modules/bar/products' }])
const categoryItems = computed(() => (data.value?.categories ?? []).map(c => ({ value: c.id, label: c.name })))

const groupItems = computed(() => (data.value?.groups ?? []).map(g => ({ value: g.id, label: g.name })))
const isMixer = computed(() => !!data.value?.product.variants.some(v => v.mixerMeasure && v.active))
const groupNames = computed(() => (data.value?.product.groupIds ?? []).map(g => data.value!.groups.find(x => x.id === g)?.name).filter(Boolean).join(', '))

// The product's own fields, the choices it asks at the till, and whether it can be a mixer.
const editing = ref<{ name: string, categoryId: string, age: 'category' | 'yes' | 'no', groupIds: string[], mixer: boolean } | null>(null)
const ageItems = computed(() => [
  { value: 'category', label: t('bar.screens.add-product.age-as-category-plain') },
  { value: 'yes', label: t('bar.screens.product.age-yes') },
  { value: 'no', label: t('bar.screens.product.age-no') },
])
function edit() {
  const p = data.value!.product
  refusal.value = null
  editing.value = { name: p.name, categoryId: p.categoryId, age: p.ageFromCategory ? 'category' : p.ageRestricted ? 'yes' : 'no', groupIds: [...p.groupIds], mixer: isMixer.value }
}
async function patch(body: Record<string, unknown>) {
  await $api(`/api/bar/products/${id.value}` as string, { method: 'PATCH', body })
  await refresh()
}
async function save() {
  const { groupIds, mixer, age, ...rest } = editing.value!
  const fields = { ...rest, ageRestricted: age === 'category' ? null : age === 'yes' }
  refusal.value = null
  try {
    if (groupIds.join() !== data.value!.product.groupIds.join()) await $api(`/api/bar/products/${id.value}/choices` as string, { method: 'POST', body: { groupIds } })
    if (mixer !== isMixer.value) await $api(`/api/bar/products/${id.value}/mixer` as string, { method: 'POST', body: { on: mixer } })
    await patch(fields)
    editing.value = null
    toast.add({ title: t('bar.screens.product.saved'), color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function setActive(active: boolean) {
  try {
    await patch({ active })
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}

// A size: new (with its Standard price), or renamed, given a barcode, or retired.
const size = ref<{ id: string | null, name: string, barcode: string, amountMinor: number | null } | null>(null)
function editSize(v?: Variant) {
  refusal.value = null
  size.value = v ? { id: v.id, name: v.name, barcode: v.barcode ?? '', amountMinor: null } : { id: null, name: '', barcode: '', amountMinor: null }
}
async function saveSize() {
  const s = size.value!
  refusal.value = null
  try {
    const barcode = s.barcode.trim() || null
    if (s.id) await $api(`/api/bar/variants/${s.id}` as string, { method: 'PATCH', body: { name: s.name, barcode } })
    else await $api(`/api/bar/products/${id.value}/variants` as string, { method: 'POST', body: { name: s.name, barcode, amountMinor: data.value?.canPrice ? s.amountMinor : undefined } })
    size.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function setSizeActive(v: Variant, active: boolean) {
  try {
    await $api(`/api/bar/variants/${v.id}` as string, { method: 'PATCH', body: { active } })
    await refresh()
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}

// A price on one list, from now or later; an empty amount takes the size off that list.
const pricing = ref<{ variant: Variant, list: List, amountMinor: number | null, later: boolean, effectiveFrom: number | null } | null>(null)
function setPrice(variant: Variant, list: List) {
  refusal.value = null
  pricing.value = { variant, list, amountMinor: priceOf(variant, list)?.amountMinor ?? null, later: false, effectiveFrom: null }
}
async function savePrice() {
  const p = pricing.value!
  refusal.value = null
  try {
    await $api('/api/bar/prices', { method: 'POST', body: { variantId: p.variant.id, priceListId: p.list.id, amountMinor: p.amountMinor, effectiveFrom: p.later && p.effectiveFrom ? p.effectiveFrom : undefined } })
    pricing.value = null
    toast.add({ title: t('bar.screens.product.price-saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// Allergens, read from the label: two sets of the 14, and where the answer came from.
const ALLERGENS = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soya', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'] as const
type Answer = { contains: string[], mayContain: string[], checked: boolean, checkedAt: number | null }
const allergens = ref<Answer | null>(null)
async function loadAllergens() {
  if (!data.value?.canAllergens) return
  allergens.value = (await $api<{ answer: Answer }>(`/api/bar/products/${id.value}/allergens` as string)).answer
}
watch(() => data.value?.canAllergens, loadAllergens, { immediate: true })
const allergenItems = computed(() => ALLERGENS.map(k => ({ value: k as string, label: t(`bar.allergen.${k}`) })))
const named = (keys: string[]) => keys.map(k => t(`bar.allergen.${k}`)).join(', ')
const allergenFacts = computed(() => {
  const a = allergens.value
  if (!a?.checked) return [{ label: t('bar.screens.product.allergens-state'), value: t('bar.screens.product.allergens-unchecked') }]
  return [
    { label: t('bar.screens.product.contains'), value: a.contains.length ? named(a.contains) : t('bar.screens.product.none-listed') },
    { label: t('bar.screens.product.may-contain'), value: a.mayContain.length ? named(a.mayContain) : t('bar.screens.product.none-listed') },
    { label: t('bar.screens.product.checked'), value: dateTime(a.checkedAt!) },
  ]
})
const label = ref<{ contains: string[], mayContain: string[], source: 'label' | 'supplier' | 'other' } | null>(null)
const sourceItems = computed(() => (['label', 'supplier', 'other'] as const).map(s => ({ value: s, label: t(`bar.screens.product.sources.${s}`) })))
function editAllergens() {
  refusal.value = null
  label.value = { contains: [...allergens.value?.contains ?? []], mayContain: [...allergens.value?.mayContain ?? []], source: 'label' }
}
async function saveAllergens() {
  const l = label.value!
  refusal.value = null
  try {
    await $api(`/api/bar/products/${id.value}/allergens` as string, { method: 'POST', body: { ...l, mayContain: l.mayContain.filter(k => !l.contains.includes(k)) } })
    label.value = null
    toast.add({ title: t('bar.screens.product.allergens-saved'), color: 'success' })
    await loadAllergens()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const priceOf = (v: Variant, l: List) => v.prices.find(p => p.listId === l.id)
function shown(v: Variant, l: List): string {
  const p = priceOf(v, l)
  if (!p || p.amountMinor === null) return t('bar.screens.product.not-sold')
  if (p.from === 'standard') return t('bar.screens.product.follows-standard', { amount: money(p.amountMinor) })
  if (p.from === 'percent') return t('bar.screens.product.percent', { amount: money(p.amountMinor), percent: l.percentOff! })
  return money(p.amountMinor)
}
function planned(v: Variant, l: List): string | null {
  const next = priceOf(v, l)?.next
  if (!next) return null
  return next.amountMinor === null ? t('bar.screens.product.withdrawn-from', { when: dateTime(next.from) }) : t('bar.screens.product.changes-to', { amount: money(next.amountMinor), when: dateTime(next.from) })
}
</script>

<template>
  <PageFrame
    :title="data?.product.name ?? t('bar.navigation.products.label')"
    :trail="trail"
  >
    <template #status>
      <StatusBadge
        v-if="data && !data.product.active"
        tone="neutral"
        :label="t('bar.screens.retired')"
      />
    </template>
    <template #primary>
      <UButton
        v-if="data"
        icon="i-lucide-plus"
        :label="t('bar.screens.product.add-size')"
        :disabled="!data.product.active"
        @click="editSize()"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data"
        class="space-y-6"
      >
        <PageSection :title="t('bar.screens.product.details')">
          <template #actions>
            <RowActions
              :label="t('bar.screens.product.actions', { name: data.product.name })"
              :items="[
                { label: t('bar.screens.product.edit'), icon: 'i-lucide-pencil', onSelect: edit },
                data.product.active
                  ? { label: t('bar.screens.product.retire'), icon: 'i-lucide-archive', onSelect: () => setActive(false) }
                  : { label: t('bar.screens.product.restore'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(true) },
              ]"
            />
          </template>
          <FactStrip
            :facts="[
              { label: t('bar.screens.products.category'), value: data.categories.find(c => c.id === data!.product.categoryId)?.name ?? '' },
              { label: t('bar.screens.product.age-check'), value: (data.product.ageRestricted ? t('bar.screens.product.age-yes') : t('bar.screens.product.age-no')) + (data.product.ageFromCategory ? ` ${t('bar.screens.product.from-category')}` : '') },
              { label: t('bar.screens.product.choices'), value: groupNames || t('bar.screens.product.no-choices') },
              { label: t('bar.screens.product.mixer'), value: isMixer ? t('bar.screens.product.age-yes') : t('bar.screens.product.age-no') },
            ]"
          />
        </PageSection>

        <PageSection
          v-if="data.canAllergens && allergens"
          :title="t('bar.screens.product.allergens')"
          :description="t('bar.screens.product.allergens-help')"
        >
          <template #actions>
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-clipboard-check"
              :label="t('bar.screens.product.check-label')"
              @click="editAllergens"
            />
          </template>
          <FactStrip :facts="allergenFacts" />
        </PageSection>

        <PageSection
          v-for="v in data.product.variants"
          :key="v.id"
          :title="v.active ? v.name : t('bar.screens.products.retired-name', { name: v.name })"
          :description="v.barcode ? t('bar.screens.product.barcode-is', { barcode: v.barcode }) : undefined"
        >
          <template #actions>
            <RowActions
              :label="t('bar.screens.product.size-actions', { name: v.name })"
              :items="[
                { label: t('bar.screens.product.edit-size'), icon: 'i-lucide-pencil', onSelect: () => editSize(v) },
                v.active
                  ? { label: t('bar.screens.product.retire-size'), icon: 'i-lucide-archive', onSelect: () => setSizeActive(v, false) }
                  : { label: t('bar.screens.product.restore-size'), icon: 'i-lucide-archive-restore', onSelect: () => setSizeActive(v, true) },
              ]"
            />
          </template>
          <RecordList :label="t('bar.screens.product.prices-of', { name: v.name })">
            <RecordListItem
              v-for="l in data.lists"
              :key="l.id"
              :name="l.name"
              :description="[shown(v, l), planned(v, l)].filter(Boolean).join(' · ')"
            >
              <UButton
                v-if="data.canPrice && l.percentOff === null"
                color="neutral"
                variant="outline"
                size="sm"
                :label="t('bar.screens.product.set-price')"
                :aria-label="t('bar.screens.product.set-price-on', { size: v.name, list: l.name })"
                @click="setPrice(v, l)"
              />
            </RecordListItem>
          </RecordList>
        </PageSection>
      </div>
    </DataBoundary>

    <UModal
      :open="!!editing"
      :title="t('bar.screens.product.edit')"
      @update:open="v => { if (!v) editing = null }"
    >
      <template #body>
        <UForm
          v-if="editing"
          id="bar-product-edit"
          :state="editing"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.products.name')"
            name="name"
            required
          >
            <UInput v-model="editing.name" />
          </UFormField>
          <UFormField
            :label="t('bar.screens.products.category')"
            name="categoryId"
          >
            <USelect
              v-model="editing.categoryId"
              :items="categoryItems"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.product.age-check')"
            :help="t('bar.screens.products.age-check-help')"
            name="age"
          >
            <USelect
              v-model="editing.age"
              :items="ageItems"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.product.choices')"
            :help="t('bar.screens.product.choices-help')"
            name="groupIds"
          >
            <USelectMenu
              v-model="editing.groupIds"
              :items="groupItems"
              value-key="value"
              multiple
              :placeholder="t('bar.screens.product.no-choices')"
            />
          </UFormField>
          <UCheckbox
            v-model="editing.mixer"
            :label="t('bar.screens.product.mixer-tick')"
            :description="t('bar.screens.product.mixer-help')"
          />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-product-edit"
          :label="t('bar.screens.save')"
        />
      </template>
    </UModal>

    <UModal
      :open="!!size"
      :title="size?.id ? t('bar.screens.product.edit-size') : t('bar.screens.product.add-size')"
      @update:open="v => { if (!v) size = null }"
    >
      <template #body>
        <UForm
          v-if="size"
          id="bar-size"
          :state="size"
          class="space-y-4"
          novalidate
          @submit="saveSize"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.product.size-name')"
            :help="t('bar.screens.product.size-name-help')"
            name="name"
            required
          >
            <UInput v-model="size.name" />
          </UFormField>
          <UFormField
            :label="t('bar.screens.product.barcode')"
            :help="t('bar.screens.product.barcode-help')"
            name="barcode"
          >
            <UInput v-model="size.barcode" />
          </UFormField>
          <UFormField
            v-if="!size.id && data?.canPrice"
            :label="t('bar.screens.products.standard-price')"
            name="amountMinor"
          >
            <FieldMoney v-model="size.amountMinor" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-size"
          :label="t('bar.screens.save')"
        />
      </template>
    </UModal>

    <UModal
      :open="!!label"
      :title="t('bar.screens.product.check-label')"
      @update:open="v => { if (!v) label = null }"
    >
      <template #body>
        <UForm
          v-if="label"
          id="bar-allergens"
          :state="label"
          class="space-y-4"
          novalidate
          @submit="saveAllergens"
        >
          <RefusalNotice :refusal="refusal" />
          <p class="text-sm text-muted">
            {{ t('bar.screens.product.check-label-help') }}
          </p>
          <UFormField name="contains">
            <UCheckboxGroup
              v-model="label.contains"
              :legend="t('bar.screens.product.contains')"
              :items="allergenItems"
              class="columns-2"
            />
          </UFormField>
          <UFormField
            :help="t('bar.screens.product.may-contain-help')"
            name="mayContain"
          >
            <UCheckboxGroup
              v-model="label.mayContain"
              :legend="t('bar.screens.product.may-contain')"
              :items="allergenItems.filter(i => !label!.contains.includes(i.value))"
              class="columns-2"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.product.source')"
            name="source"
          >
            <USelect
              v-model="label.source"
              :items="sourceItems"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-allergens"
          :label="t('bar.screens.product.allergens-record')"
        />
      </template>
    </UModal>

    <UModal
      :open="!!pricing"
      :title="pricing ? t('bar.screens.product.price-title', { size: pricing.variant.name, list: pricing.list.name }) : ''"
      @update:open="v => { if (!v) pricing = null }"
    >
      <template #body>
        <UForm
          v-if="pricing"
          id="bar-price"
          :state="pricing"
          class="space-y-4"
          novalidate
          @submit="savePrice"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.product.price')"
            :help="pricing.list.standard ? t('bar.screens.product.price-help-standard') : t('bar.screens.product.price-help')"
            name="amountMinor"
          >
            <FieldMoney v-model="pricing.amountMinor" />
          </UFormField>
          <UCheckbox
            v-model="pricing.later"
            :label="t('bar.screens.product.later')"
          />
          <UFormField
            v-if="pricing.later"
            :label="t('bar.screens.product.from')"
            name="effectiveFrom"
            required
          >
            <FieldDateTime
              v-model="pricing.effectiveFrom"
              :min="Date.now()"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-price"
          :label="t('bar.screens.product.save-price')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
