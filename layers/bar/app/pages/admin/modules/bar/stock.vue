<!-- Stock (Bar specification, tab 2 "Stock"; tab 10): the things that are counted, with how much each
     location holds, and the locations themselves. Quantities are kept in base units (each, ml or g)
     and shown in the unit people count in. A level is never typed: it moves with sales, refunds and,
     later, deliveries, wastage, transfers and stocktakes. Stock never stops a sale, so a level may
     go below nought. A pack's size may be typed in litres or kilograms; each form says beside its
     fields what is missing, and a category is needed once there are categories, so every item is
     on some count by category. -->
<script setup lang="ts">
type Unit = StockUnit
interface Item {
  id: string
  name: string
  categoryId: string | null
  baseUnit: Unit
  packSize: number
  packName: string
  countUnitSize: number
  costMinor: number | null
  reorderLevel: number | null
  fullWeightG: number | null
  emptyWeightG: number | null
  active: boolean
  levels: { locationId: string, quantity: number }[]
  total: number
  low: boolean
}
interface Location { id: string, name: string, spaceId: string | null, venueId: string | null, active: boolean }
interface Venue { id: string, name: string, spaces: { id: string, name: string }[] }

const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { toRefusal, fieldErrors } = useRefusal()
const { number, amount, countWord } = useStockAmounts()
const toast = useToast()
const { offer } = useUndo()
type Answer = { contains: string[], mayContain: string[], checked: boolean, checkedAt: number | null }
const { data, status, error, refresh } = await useAPI<{ items: Item[], locations: Location[], currency: string, categories: { id: string, name: string }[], venues: Venue[], canAllergens: boolean, allergens: Record<string, Answer> }>('/api/bar/stock', { key: 'bar:stock' })

// The home card for labels not checked opens this page with ?allergens=unchecked.
const route = useRoute()
const uncheckedOnly = computed(() => route.query.allergens === 'unchecked' && !!data.value?.canAllergens)
const query = ref('')
const searching = ref(false)
const showRetiredItems = ref(false)
const showRetiredLocations = ref(false)
const shownItems = computed(() => (data.value?.items ?? []).filter(i => (!uncheckedOnly.value || !data.value?.allergens[i.id]?.checked) && i.name.toLowerCase().includes(query.value.trim().toLowerCase())))
const currentItems = computed(() => shownItems.value.filter(i => i.active))
const retiredItems = computed(() => shownItems.value.filter(i => !i.active))
const currentLocations = computed(() => (data.value?.locations ?? []).filter(l => l.active))
const retiredLocations = computed(() => (data.value?.locations ?? []).filter(l => !l.active))

const unitItems = computed(() => (['each', 'ml', 'g'] as const).map(u => ({ value: u, label: t(`bar.screens.stock.units.${u}`) })))
const categoryItems = computed(() => [{ value: 'none', label: t('bar.screens.stock.no-category') }, ...(data.value?.categories ?? []).map(c => ({ value: c.id, label: c.name }))])
// A location sits at a venue, or in one of its spaces.
const placeItems = computed(() => [
  { value: 'none', label: t('bar.screens.stock.no-place') },
  ...(data.value?.venues ?? []).flatMap(v => [{ value: `v:${v.id}`, label: v.name }, ...v.spaces.map(s => ({ value: `s:${s.id}`, label: `${v.name} · ${s.name}` }))]),
])
const placeName = (l: Location) => placeItems.value.find(p => p.value === (l.spaceId ? `s:${l.spaceId}` : l.venueId ? `v:${l.venueId}` : 'none'))?.label

const named = (keys: string[]) => keys.map(k => t(`bar.allergen.${k}`)).join(', ')
// What the label says, for someone who records allergens: products made from the item answer with it.
function allergenText(i: Item): string | null {
  if (!data.value?.canAllergens) return null
  const a = data.value.allergens[i.id]
  if (!a?.checked) return t('bar.screens.product.allergens-unchecked')
  if (!a.contains.length && !a.mayContain.length) return t('bar.screens.product.none-listed')
  return [a.contains.length ? `${t('bar.screens.product.contains')}: ${named(a.contains)}` : null, a.mayContain.length ? `${t('bar.screens.product.may-contain')}: ${named(a.mayContain)}` : null].filter(Boolean).join(' · ')
}
// Levels by location are the console's Stock screen; set-up shows the pack and the label.
function describeItem(i: Item): string {
  const pack = i.baseUnit === 'each'
    ? t('bar.screens.stock.pack-each', { size: number(i.packSize, 0), pack: i.packName })
    : t('bar.screens.stock.pack', { size: number(i.packSize, 0), unit: t(`bar.screens.stock.units.${i.baseUnit}`), pack: i.packName })
  return [pack, allergenText(i)].filter(Boolean).join(' · ')
}
const checking = ref<{ title: string, endpoint: string, contains: string[], mayContain: string[] } | null>(null)
function checkLabel(i: Item) {
  const a = data.value?.allergens[i.id]
  checking.value = { title: t('bar.screens.choices.allergens-of', { name: i.name }), endpoint: `/api/bar/stock/items/${i.id}/allergens`, contains: a?.contains ?? [], mayContain: a?.mayContain ?? [] }
}

// A pack's size is kept in base units but may be typed in litres or kilograms: 50 l, not 50000 ml.
const LARGE = 1000 // not-policy: a litre in ml, a kilogram in g
const scaleItems = (u: Unit) => u === 'each' ? [] : [{ value: 1, label: t(`bar.screens.stock.units.${u}`) }, { value: LARGE, label: t(`bar.screens.stock.units.large-${u}`) }]
const item = ref<{ id: string | null, name: string, categoryId: string, baseUnit: Unit, packAmount: number | null, packScale: number, packName: string, countUnitSize: number | null, costMinor: number | null, reorderLevel: number | null, weighed: boolean, fullWeightG: number | null, emptyWeightG: number | null, moved: boolean } | null>(null)
const packSize = computed(() => item.value?.packAmount ? Math.round(item.value.packAmount * (item.value.baseUnit === 'each' ? 1 : item.value.packScale)) : null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const itemForm = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('itemForm')
const locationForm = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('locationForm')
function editItem(i?: Item) {
  refusal.value = null
  const large = !!i && i.baseUnit !== 'each' && i.packSize % LARGE === 0
  item.value = i
    ? { id: i.id, name: i.name, categoryId: i.categoryId ?? 'none', baseUnit: i.baseUnit, packAmount: large ? i.packSize / LARGE : i.packSize, packScale: large ? LARGE : 1, packName: i.packName, countUnitSize: i.countUnitSize, costMinor: i.costMinor, reorderLevel: i.reorderLevel, weighed: i.fullWeightG !== null, fullWeightG: i.fullWeightG, emptyWeightG: i.emptyWeightG, moved: i.levels.length > 0 }
    : { id: null, name: '', categoryId: 'none', baseUnit: 'ml', packAmount: null, packScale: 1, packName: '', countUnitSize: null, costMinor: null, reorderLevel: null, weighed: false, fullWeightG: null, emptyWeightG: null, moved: false }
}
// What the form still needs, beside each field. A category is needed once there are any, so no
// item is left off every count by category.
function checkItem() {
  const f = item.value!
  const missing = needs({
    name: f.name,
    packName: f.packName,
    packAmount: f.packAmount ? true : null,
    categoryId: !(data.value?.categories.length) || f.categoryId !== 'none' ? true : null,
    fullWeightG: f.weighed ? f.fullWeightG : true,
    emptyWeightG: f.weighed ? f.emptyWeightG !== null : true,
  })
  if (f.weighed && f.fullWeightG !== null && f.emptyWeightG !== null && f.fullWeightG <= f.emptyWeightG)
    missing.push({ name: 'fullWeightG', message: t('bar.screens.stock.weights-wrong') })
  return missing
}
// What one counted thing is called, for the hint under the count field.
const countPreview = computed(() => {
  const f = item.value
  if (!f || !packSize.value) return ''
  const size = f.countUnitSize ?? (f.baseUnit === 'each' ? 1 : packSize.value)
  return t('bar.screens.stock.count-preview', { unit: countWord({ baseUnit: f.baseUnit, countUnitSize: size, packSize: packSize.value, packName: f.packName.trim() || undefined }, 2) })
})
async function saveItem() {
  const f = item.value!
  refusal.value = null
  const body = {
    name: f.name, categoryId: f.categoryId === 'none' ? null : f.categoryId, packSize: packSize.value, packName: f.packName,
    // A can or a case counts in ones; a keg or a bottle in itself unless told otherwise.
    countUnitSize: f.countUnitSize ?? (f.baseUnit === 'each' ? 1 : packSize.value), costMinor: f.costMinor, reorderLevel: f.reorderLevel,
    fullWeightG: f.weighed ? f.fullWeightG : null, emptyWeightG: f.weighed ? f.emptyWeightG : null,
    ...(f.moved ? {} : { baseUnit: f.baseUnit }),
  }
  try {
    if (f.id) await $api(`/api/bar/stock/items/${f.id}` as string, { method: 'PATCH', body })
    else await $api('/api/bar/stock/items', { method: 'POST', body: { ...body, baseUnit: f.baseUnit } })
    toast.add({ title: t('bar.screens.stock.item-saved'), color: 'success' })
    item.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    // The server names the body's packSize; the field that types it is packAmount.
    itemForm.value?.setErrors(fieldErrors(refusal.value).map(x => x.name === 'packSize' ? { ...x, name: 'packAmount' } : x))
  }
}

const location = ref<{ id: string | null, name: string, place: string } | null>(null)
function editLocation(l?: Location) {
  refusal.value = null
  location.value = l
    ? { id: l.id, name: l.name, place: l.spaceId ? `s:${l.spaceId}` : l.venueId ? `v:${l.venueId}` : 'none' }
    : { id: null, name: '', place: 'none' }
}
async function saveLocation() {
  const f = location.value!
  refusal.value = null
  const body = { name: f.name, spaceId: f.place.startsWith('s:') ? f.place.slice(2) : null, venueId: f.place.startsWith('v:') ? f.place.slice(2) : null }
  try {
    if (f.id) await $api(`/api/bar/stock/locations/${f.id}` as string, { method: 'PATCH', body })
    else await $api('/api/bar/stock/locations', { method: 'POST', body })
    toast.add({ title: t('bar.screens.stock.location-saved'), color: 'success' })
    location.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    locationForm.value?.setErrors(fieldErrors(refusal.value))
  }
}

// Retiring or bringing back an item or a location offers Undo.
async function setActive(path: string, name: string, active: boolean) {
  try {
    await $api(path, { method: 'PATCH', body: { active } })
    await refresh()
    offer(active ? t('bar.screens.stock.restored', { name }) : t('bar.screens.stock.retired', { name }), async () => {
      await $api(path, { method: 'PATCH', body: { active: !active } })
      await refresh()
    })
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, description: toRefusal(e).remedy, color: 'error' })
  }
}
</script>

<template>
  <PageFrame :title="t('bar.navigation.stock.label')">
    <template #primary>
      <div class="flex items-center gap-2">
        <SearchToggle
          v-model="query"
          v-model:open="searching"
          :label="t('bar.screens.stock.search')"
        />
        <UButton
          icon="i-lucide-plus"
          :label="t('bar.screens.stock.new-item')"
          :ui="{ label: searching ? 'max-sm:sr-only' : '' }"
          @click="editItem()"
        />
      </div>
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
        <EmptyState
          v-if="!data.items.length"
          icon="i-lucide-package"
          :title="t('bar.screens.stock.empty-title')"
          :description="t('bar.screens.stock.empty')"
        >
          <template #actions>
            <UButton
              icon="i-lucide-plus"
              :label="t('bar.screens.stock.new-item')"
              @click="editItem()"
            />
          </template>
        </EmptyState>
        <PageSection
          v-else
          :title="t('bar.screens.stock.items')"
          :description="t('bar.screens.stock.items-help')"
        >
          <UAlert
            v-if="uncheckedOnly"
            color="neutral"
            variant="subtle"
            icon="i-lucide-filter"
            :title="t('bar.screens.stock.unchecked-only')"
            :actions="[{ label: t('bar.screens.stock.show-all'), to: '/admin/modules/bar/stock', color: 'neutral', variant: 'outline' }]"
            class="mb-3"
          />
          <div class="space-y-4">
            <p
              v-if="!shownItems.length"
              class="text-sm text-muted"
            >
              {{ query.trim() ? t('bar.screens.stock.no-match') : t('bar.screens.stock.all-checked') }}
            </p>
            <RecordList
              v-if="currentItems.length"
              :label="t('bar.screens.stock.items')"
            >
              <RecordListItem
                v-for="i in currentItems"
                :key="i.id"
                :name="i.name"
                :description="describeItem(i)"
              >
                <div class="flex shrink-0 items-center gap-2">
                  <StatusBadge
                    v-if="i.active && i.low"
                    tone="warning"
                    :label="t('bar.screens.stock.low')"
                  />
                  <span class="text-sm tabular-nums">{{ amount(i, i.total) }}</span>
                  <RowActions
                    :label="t('bar.screens.stock.item-actions', { name: i.name })"
                    :items="[
                      { label: t('bar.screens.stock.edit-item'), icon: 'i-lucide-pencil', onSelect: () => editItem(i) },
                      ...(data.canAllergens ? [{ label: t('bar.screens.product.check-label'), icon: 'i-lucide-clipboard-check', onSelect: () => checkLabel(i) }] : []),
                      i.active
                        ? { label: t('bar.screens.stock.retire-item'), icon: 'i-lucide-archive', onSelect: () => setActive(`/api/bar/stock/items/${i.id}`, i.name, false) }
                        : { label: t('bar.screens.stock.restore-item'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(`/api/bar/stock/items/${i.id}`, i.name, true) },
                    ]"
                  />
                </div>
              </RecordListItem>
            </RecordList>
            <CollapsibleDivider
              :open="showRetiredItems || !!query.trim()"
              :label="t('bar.screens.stock.retired-items')"
              :count="retiredItems.length"
              @update:open="v => showRetiredItems = v"
            >
              <RecordList :label="t('bar.screens.stock.retired-items')">
                <RecordListItem
                  v-for="i in retiredItems"
                  :key="i.id"
                  :name="i.name"
                  :description="describeItem(i)"
                  muted
                >
                  <div class="flex shrink-0 items-center gap-2">
                    <StatusBadge
                      v-if="i.active && i.low"
                      tone="warning"
                      :label="t('bar.screens.stock.low')"
                    />
                    <span class="text-sm tabular-nums">{{ amount(i, i.total) }}</span>
                    <RowActions
                      :label="t('bar.screens.stock.item-actions', { name: i.name })"
                      :items="[
                        { label: t('bar.screens.stock.edit-item'), icon: 'i-lucide-pencil', onSelect: () => editItem(i) },
                        ...(data.canAllergens ? [{ label: t('bar.screens.product.check-label'), icon: 'i-lucide-clipboard-check', onSelect: () => checkLabel(i) }] : []),
                        i.active
                          ? { label: t('bar.screens.stock.retire-item'), icon: 'i-lucide-archive', onSelect: () => setActive(`/api/bar/stock/items/${i.id}`, i.name, false) }
                          : { label: t('bar.screens.stock.restore-item'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(`/api/bar/stock/items/${i.id}`, i.name, true) },
                      ]"
                    />
                  </div>
                </RecordListItem>
              </RecordList>
            </CollapsibleDivider>
          </div>
        </PageSection>

        <PageSection
          :title="t('bar.screens.stock.locations')"
          :description="t('bar.screens.stock.locations-help')"
        >
          <template #actions>
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              :label="t('bar.screens.stock.new-location')"
              @click="editLocation()"
            />
          </template>
          <p
            v-if="!data.locations.length"
            class="text-sm text-muted"
          >
            {{ t('bar.screens.stock.no-locations') }}
          </p>
          <div
            v-else
            class="space-y-4"
          >
            <RecordList
              v-if="currentLocations.length"
              :label="t('bar.screens.stock.locations')"
            >
              <RecordListItem
                v-for="l in currentLocations"
                :key="l.id"
                :name="l.name"
                :description="placeName(l)"
              >
                <RowActions
                  :label="t('bar.screens.stock.location-actions', { name: l.name })"
                  :items="[
                    { label: t('bar.screens.stock.edit-location'), icon: 'i-lucide-pencil', onSelect: () => editLocation(l) },
                    l.active
                      ? { label: t('bar.screens.stock.retire-location'), icon: 'i-lucide-archive', onSelect: () => setActive(`/api/bar/stock/locations/${l.id}`, l.name, false) }
                      : { label: t('bar.screens.stock.restore-location'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(`/api/bar/stock/locations/${l.id}`, l.name, true) },
                  ]"
                />
              </RecordListItem>
            </RecordList>
            <CollapsibleDivider
              :open="showRetiredLocations"
              :label="t('bar.screens.stock.retired-locations')"
              :count="retiredLocations.length"
              @update:open="v => showRetiredLocations = v"
            >
              <RecordList :label="t('bar.screens.stock.retired-locations')">
                <RecordListItem
                  v-for="l in retiredLocations"
                  :key="l.id"
                  :name="l.name"
                  :description="placeName(l)"
                  muted
                >
                  <RowActions
                    :label="t('bar.screens.stock.location-actions', { name: l.name })"
                    :items="[
                      { label: t('bar.screens.stock.edit-location'), icon: 'i-lucide-pencil', onSelect: () => editLocation(l) },
                      l.active
                        ? { label: t('bar.screens.stock.retire-location'), icon: 'i-lucide-archive', onSelect: () => setActive(`/api/bar/stock/locations/${l.id}`, l.name, false) }
                        : { label: t('bar.screens.stock.restore-location'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(`/api/bar/stock/locations/${l.id}`, l.name, true) },
                    ]"
                  />
                </RecordListItem>
              </RecordList>
            </CollapsibleDivider>
          </div>
        </PageSection>
      </div>
    </DataBoundary>

    <UModal
      :open="!!item"
      :title="item?.id ? t('bar.screens.stock.edit-item') : t('bar.screens.stock.new-item')"
      @update:open="v => { if (!v) item = null }"
    >
      <template #body>
        <UForm
          v-if="item"
          id="bar-stock-item"
          ref="itemForm"
          :state="item"
          :validate="checkItem"
          class="space-y-4"
          novalidate
          @submit="saveItem"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.stock.name')"
            :help="t('bar.screens.stock.name-help')"
            name="name"
            required
          >
            <UInput v-model="item.name" />
          </UFormField>
          <UFormField
            :label="t('bar.screens.stock.unit')"
            :help="item.moved ? t('bar.screens.stock.unit-fixed') : t('bar.screens.stock.unit-help')"
            name="baseUnit"
          >
            <USelect
              v-model="item.baseUnit"
              :items="unitItems"
              :disabled="item.moved"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.stock.pack-name')"
            :help="t('bar.screens.stock.pack-name-help')"
            name="packName"
            required
          >
            <UInput v-model="item.packName" />
          </UFormField>
          <UFormField
            :label="t('bar.screens.stock.pack-size')"
            :help="t('bar.screens.stock.pack-size-help')"
            name="packAmount"
            required
          >
            <UFieldGroup>
              <UInputNumber
                v-model="item.packAmount"
                :min="0"
                :step="item.baseUnit !== 'each' && item.packScale === LARGE ? 0.1 : 1"
                :format-options="{ maximumFractionDigits: item.baseUnit !== 'each' && item.packScale === LARGE ? 3 : 0 }"
              />
              <USelect
                v-if="item.baseUnit !== 'each'"
                v-model="item.packScale"
                :items="scaleItems(item.baseUnit)"
                :aria-label="t('bar.screens.stock.pack-size-unit')"
                class="w-28"
              />
              <UBadge
                v-else
                color="neutral"
                variant="outline"
                size="lg"
                :label="t('bar.screens.stock.units.each')"
              />
            </UFieldGroup>
          </UFormField>
          <UFormField
            :label="t('bar.screens.stock.cost')"
            :help="t('bar.screens.stock.cost-help')"
            name="costMinor"
          >
            <FieldMoney v-model="item.costMinor" />
          </UFormField>
          <UFormField
            :label="t('bar.screens.stock.category')"
            :help="t('bar.screens.stock.category-help')"
            name="categoryId"
            :required="!!data?.categories.length"
          >
            <USelectMenu
              v-model="item.categoryId"
              :items="categoryItems"
              value-key="value"
            />
          </UFormField>
          <UCollapsible>
            <UButton
              color="neutral"
              variant="link"
              trailing-icon="i-lucide-chevron-down"
              :label="t('bar.screens.stock.more')"
            />
            <template #content>
              <div class="space-y-4 pt-2">
                <UFormField
                  :label="t('bar.screens.stock.count-unit')"
                  :help="[t('bar.screens.stock.count-unit-help'), countPreview].filter(Boolean).join(' ')"
                  name="countUnitSize"
                >
                  <UFieldGroup>
                    <UInputNumber
                      v-model="item.countUnitSize"
                      :min="1"
                      :placeholder="String(item.baseUnit === 'each' ? 1 : packSize ?? '')"
                    />
                    <UBadge
                      color="neutral"
                      variant="outline"
                      size="lg"
                      :label="t(`bar.screens.stock.units.${item.baseUnit}`)"
                    />
                  </UFieldGroup>
                </UFormField>
                <UFormField
                  :label="t('bar.screens.stock.reorder')"
                  :help="t('bar.screens.stock.reorder-help')"
                  name="reorderLevel"
                >
                  <UFieldGroup>
                    <UInputNumber
                      v-model="item.reorderLevel"
                      :min="0"
                    />
                    <UBadge
                      color="neutral"
                      variant="outline"
                      size="lg"
                      :label="t(`bar.screens.stock.units.${item.baseUnit}`)"
                    />
                  </UFieldGroup>
                </UFormField>
                <UCheckbox
                  v-model="item.weighed"
                  :label="t('bar.screens.stock.weighed')"
                  :description="t('bar.screens.stock.weighed-help')"
                />
                <template v-if="item.weighed">
                  <UFormField
                    :label="t('bar.screens.stock.full-weight')"
                    name="fullWeightG"
                    required
                  >
                    <UFieldGroup>
                      <UInputNumber
                        v-model="item.fullWeightG"
                        :min="1"
                      />
                      <UBadge
                        color="neutral"
                        variant="outline"
                        size="lg"
                        :label="t('bar.screens.stock.units.g')"
                      />
                    </UFieldGroup>
                  </UFormField>
                  <UFormField
                    :label="t('bar.screens.stock.empty-weight')"
                    name="emptyWeightG"
                    required
                  >
                    <UFieldGroup>
                      <UInputNumber
                        v-model="item.emptyWeightG"
                        :min="0"
                      />
                      <UBadge
                        color="neutral"
                        variant="outline"
                        size="lg"
                        :label="t('bar.screens.stock.units.g')"
                      />
                    </UFieldGroup>
                  </UFormField>
                </template>
              </div>
            </template>
          </UCollapsible>
          <p
            v-if="item.costMinor !== null && packSize"
            class="text-sm text-muted"
          >
            {{ t('bar.screens.stock.cost-per', { amount: money(item.costMinor), pack: item.packName || t('bar.screens.stock.pack-fallback') }) }}
          </p>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-stock-item"
          :label="t('bar.screens.save')"
        />
      </template>
    </UModal>

    <UModal
      :open="!!location"
      :title="location?.id ? t('bar.screens.stock.edit-location') : t('bar.screens.stock.new-location')"
      @update:open="v => { if (!v) location = null }"
    >
      <template #body>
        <UForm
          v-if="location"
          id="bar-stock-location"
          ref="locationForm"
          :state="location"
          :validate="() => needs({ name: location?.name })"
          class="space-y-4"
          novalidate
          @submit="saveLocation"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.stock.location-name')"
            :help="t('bar.screens.stock.location-name-help')"
            name="name"
            required
          >
            <UInput v-model="location.name" />
          </UFormField>
          <UFormField
            :label="t('bar.screens.stock.place')"
            :help="t('bar.screens.stock.place-help')"
            name="place"
          >
            <USelectMenu
              v-model="location.place"
              :items="placeItems"
              value-key="value"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-stock-location"
          :label="t('bar.screens.save')"
        />
      </template>
    </UModal>
    <BarAllergenDialog
      :target="checking"
      :help="t('bar.screens.stock.allergens-help')"
      @close="checking = null"
      @saved="checking = null; refresh()"
    />
  </PageFrame>
</template>
