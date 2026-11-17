<!-- A product (S11): its name, category and age check, and its sizes with a price on each list. A
     price is never edited: setting one writes a new price from now or a later moment, so a sale already
     rung up keeps what it was charged. A size or product that has been sold is retired, not deleted. -->
<script setup lang="ts">
interface VariantPrice { listId: string, amountMinor: number | null, from: 'list' | 'standard' | 'percent' | null, next: { amountMinor: number | null, from: number } | null }
interface Variant { id: string, name: string, barcode: string | null, active: boolean, prices: VariantPrice[] }
interface Product { id: string, categoryId: string, name: string, ageRestricted: boolean, active: boolean, variants: Variant[] }
interface List { id: string, name: string, standard: boolean, percentOff: number | null }

const { t } = useT()
const route = useRoute()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { dateTime } = useDates()
const { toRefusal } = useRefusal()
const toast = useToast()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<{ product: Product, categories: { id: string, name: string }[], lists: List[], canPrice: boolean }>(() => `/api/bar/products/${id.value}`, { key: `bar:product:${id.value}` })

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const trail = computed(() => [{ label: t('bar.navigation.products.label'), to: '/admin/modules/bar/products' }])
const categoryItems = computed(() => (data.value?.categories ?? []).map(c => ({ value: c.id, label: c.name })))

// The product's own fields.
const editing = ref<{ name: string, categoryId: string, ageRestricted: boolean } | null>(null)
function edit() {
  const p = data.value!.product
  refusal.value = null
  editing.value = { name: p.name, categoryId: p.categoryId, ageRestricted: p.ageRestricted }
}
async function patch(body: Record<string, unknown>) {
  await $api(`/api/bar/products/${id.value}` as string, { method: 'PATCH', body })
  await refresh()
}
async function save() {
  refusal.value = null
  try {
    await patch(editing.value!)
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
              { label: t('bar.screens.product.age-check'), value: data.product.ageRestricted ? t('bar.screens.product.age-yes') : t('bar.screens.product.age-no') },
            ]"
          />
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
          <UCheckbox
            v-model="editing.ageRestricted"
            :label="t('bar.screens.products.age-check')"
            :description="t('bar.screens.products.age-check-help')"
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
