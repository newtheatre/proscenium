<!-- Stock (Bar specification, tab 2 "Stock"; tab 10): the things that are counted, with how much each
     location holds, and the locations themselves. Quantities are kept in base units (each, ml or g)
     and shown in the unit people count in. A level is never typed: it moves with sales, refunds and,
     later, deliveries, wastage, transfers and stocktakes. Stock never stops a sale, so a level may
     go below nought. -->
<script setup lang="ts">
type Unit = 'each' | 'ml' | 'g'
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
const { toRefusal } = useRefusal()
const toast = useToast()
type Answer = { contains: string[], mayContain: string[], checked: boolean, checkedAt: number | null }
const { data, status, error, refresh } = await useAPI<{ items: Item[], locations: Location[], currency: string, categories: { id: string, name: string }[], venues: Venue[], canAllergens: boolean, allergens: Record<string, Answer> }>('/api/bar/stock', { key: 'bar:stock' })

const unitItems = computed(() => (['each', 'ml', 'g'] as const).map(u => ({ value: u, label: t(`bar.screens.stock.units.${u}`) })))
const categoryItems = computed(() => [{ value: 'none', label: t('bar.screens.stock.no-category') }, ...(data.value?.categories ?? []).map(c => ({ value: c.id, label: c.name }))])
// A location sits at a venue, or in one of its spaces.
const placeItems = computed(() => [
  { value: 'none', label: t('bar.screens.stock.no-place') },
  ...(data.value?.venues ?? []).flatMap(v => [{ value: `v:${v.id}`, label: v.name }, ...v.spaces.map(s => ({ value: `s:${s.id}`, label: `${v.name} · ${s.name}` }))]),
])
const placeName = (l: Location) => placeItems.value.find(p => p.value === (l.spaceId ? `s:${l.spaceId}` : l.venueId ? `v:${l.venueId}` : 'none'))?.label

// "1.5 bottles (1,050 ml)"; a can is counted as itself.
const number = (n: number, digits = 2) => n.toLocaleString(undefined, { maximumFractionDigits: digits })
function amount(item: Item, quantity: number): string {
  const base = `${number(quantity, 0)} ${t(`bar.screens.stock.units.${item.baseUnit}`)}`
  if (item.countUnitSize === 1) return base
  return t('bar.screens.stock.counted', { count: number(quantity / item.countUnitSize), base })
}
const locationName = (id: string) => data.value?.locations.find(l => l.id === id)?.name ?? ''
const named = (keys: string[]) => keys.map(k => t(`bar.allergen.${k}`)).join(', ')
// What the label says, for someone who records allergens: products made from the item answer with it.
function allergenText(i: Item): string | null {
  if (!data.value?.canAllergens) return null
  const a = data.value.allergens[i.id]
  if (!a?.checked) return t('bar.screens.product.allergens-unchecked')
  if (!a.contains.length && !a.mayContain.length) return t('bar.screens.product.none-listed')
  return [a.contains.length ? `${t('bar.screens.product.contains')}: ${named(a.contains)}` : null, a.mayContain.length ? `${t('bar.screens.product.may-contain')}: ${named(a.mayContain)}` : null].filter(Boolean).join(' · ')
}
function describeItem(i: Item): string {
  const where = i.levels.filter(l => l.quantity !== 0).map(l => `${locationName(l.locationId)} ${amount(i, l.quantity)}`)
  return [t('bar.screens.stock.pack', { size: number(i.packSize, 0), unit: t(`bar.screens.stock.units.${i.baseUnit}`), pack: i.packName }), ...where, allergenText(i)].filter(Boolean).join(' · ')
}
const checking = ref<{ title: string, endpoint: string, contains: string[], mayContain: string[] } | null>(null)
function checkLabel(i: Item) {
  const a = data.value?.allergens[i.id]
  checking.value = { title: t('bar.screens.choices.allergens-of', { name: i.name }), endpoint: `/api/bar/stock/items/${i.id}/allergens`, contains: a?.contains ?? [], mayContain: a?.mayContain ?? [] }
}

const item = ref<{ id: string | null, name: string, categoryId: string, baseUnit: Unit, packSize: number | null, packName: string, countUnitSize: number | null, costMinor: number | null, reorderLevel: number | null, weighed: boolean, fullWeightG: number | null, emptyWeightG: number | null, moved: boolean } | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
function editItem(i?: Item) {
  refusal.value = null
  item.value = i
    ? { id: i.id, name: i.name, categoryId: i.categoryId ?? 'none', baseUnit: i.baseUnit, packSize: i.packSize, packName: i.packName, countUnitSize: i.countUnitSize, costMinor: i.costMinor, reorderLevel: i.reorderLevel, weighed: i.fullWeightG !== null, fullWeightG: i.fullWeightG, emptyWeightG: i.emptyWeightG, moved: i.levels.length > 0 }
    : { id: null, name: '', categoryId: 'none', baseUnit: 'ml', packSize: null, packName: '', countUnitSize: null, costMinor: null, reorderLevel: null, weighed: false, fullWeightG: null, emptyWeightG: null, moved: false }
}
async function saveItem() {
  const f = item.value!
  refusal.value = null
  const body = {
    name: f.name, categoryId: f.categoryId === 'none' ? null : f.categoryId, packSize: f.packSize, packName: f.packName,
    // A can or a case counts in ones; a keg or a bottle in itself unless told otherwise.
    countUnitSize: f.countUnitSize ?? (f.baseUnit === 'each' ? 1 : f.packSize), costMinor: f.costMinor, reorderLevel: f.reorderLevel,
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
  }
}

async function setActive(path: string, active: boolean) {
  try {
    await $api(path, { method: 'PATCH', body: { active } })
    await refresh()
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, description: toRefusal(e).remedy, color: 'error' })
  }
}
</script>

<template>
  <PageFrame :title="t('bar.navigation.stock.label')">
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('bar.screens.stock.new-item')"
        @click="editItem()"
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
        <PageSection
          :title="t('bar.screens.stock.items')"
          :description="t('bar.screens.stock.items-help')"
        >
          <EmptyState
            v-if="!data.items.length"
            icon="i-lucide-package"
            :title="t('bar.screens.stock.empty-title')"
            :description="t('bar.screens.stock.empty')"
          />
          <RecordList
            v-else
            :label="t('bar.screens.stock.items')"
          >
            <RecordListItem
              v-for="i in data.items"
              :key="i.id"
              :name="i.active ? i.name : t('bar.screens.products.retired-name', { name: i.name })"
              :description="describeItem(i)"
              :muted="!i.active"
            >
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
                    ? { label: t('bar.screens.stock.retire-item'), icon: 'i-lucide-archive', onSelect: () => setActive(`/api/bar/stock/items/${i.id}`, false) }
                    : { label: t('bar.screens.stock.restore-item'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(`/api/bar/stock/items/${i.id}`, true) },
                ]"
              />
            </RecordListItem>
          </RecordList>
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
          <RecordList
            v-else
            :label="t('bar.screens.stock.locations')"
          >
            <RecordListItem
              v-for="l in data.locations"
              :key="l.id"
              :name="l.active ? l.name : t('bar.screens.products.retired-name', { name: l.name })"
              :description="placeName(l)"
              :muted="!l.active"
            >
              <RowActions
                :label="t('bar.screens.stock.location-actions', { name: l.name })"
                :items="[
                  { label: t('bar.screens.stock.edit-location'), icon: 'i-lucide-pencil', onSelect: () => editLocation(l) },
                  l.active
                    ? { label: t('bar.screens.stock.retire-location'), icon: 'i-lucide-archive', onSelect: () => setActive(`/api/bar/stock/locations/${l.id}`, false) }
                    : { label: t('bar.screens.stock.restore-location'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(`/api/bar/stock/locations/${l.id}`, true) },
                ]"
              />
            </RecordListItem>
          </RecordList>
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
          :state="item"
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
            name="packSize"
            required
          >
            <UFieldGroup>
              <UInputNumber
                v-model="item.packSize"
                :min="1"
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
                  :help="t('bar.screens.stock.count-unit-help')"
                  name="countUnitSize"
                >
                  <UFieldGroup>
                    <UInputNumber
                      v-model="item.countUnitSize"
                      :min="1"
                      :placeholder="String(item.baseUnit === 'each' ? 1 : item.packSize ?? '')"
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
            v-if="item.costMinor !== null && item.packSize"
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
          :state="location"
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
