<!-- A delivery (S9). A draft: where it goes, the supplier and the delivery note number, then a line per
     item with packs, loose units and the pack cost if it changed. Receiving it moves the stock in at
     once and is final; a mistake is put right by another delivery, by wastage or at the next count.
     A received delivery is its record. "new" starts one. Pressing Enter in the form saves the draft;
     receiving is its own button and asks first, naming what will arrive and where. Items are added
     from a searchable list, several at once; a supplier not on the list yet can be added from the
     supplier box. For someone who records allergens, the form asks "Has the label changed?" about
     each item on it whose label is due a fresh look, before it is received and after. -->
<script setup lang="ts">
interface FormItem { id: string, name: string, baseUnit: StockUnit, packSize: number, packName: string, countUnitSize: number, costMinor: number | null }
interface Line { stockItemId: string, packs: number, looseUnits: number, packCostMinor: number | null }
interface Delivery { id: string, locationId: string, supplierTermId: string | null, supplier: string | null, supplierRef: string | null, state: 'draft' | 'received', createdBy: string, receivedBy: string | null, receivedAt: number | null, createdAt: number, lines: (Line & { quantity: number })[] }
interface FormData { items: FormItem[], locations: { id: string, name: string }[], suppliers: { id: string, label: string }[] }

const { t } = useT()
const route = useRoute()
const router = useRouter()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { dateTime } = useDates()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { amount } = useStockAmounts()
const toast = useToast()

const id = computed(() => route.params.id as string)
const isNew = computed(() => id.value === 'new')
interface LabelDue { stockItemId: string, name: string, checkedAt: number | null }
const { data, status, error, refresh } = await useAPI<FormData & { delivery?: Delivery, canAllergens?: boolean, labelsDue?: LabelDue[] }>(
  () => isNew.value ? '/api/bar/stock/deliveries' : `/api/bar/stock/deliveries/${id.value}`,
  { key: `bar:delivery:${id.value}` },
)

const NONE = 'none'
const form = ref<{ locationId: string, supplierTermId: string, supplierRef: string, lines: Line[] }>({ locationId: '', supplierTermId: NONE, supplierRef: '', lines: [] })
watch(data, (d) => {
  if (!d) return
  const v = d.delivery
  form.value = v
    ? { locationId: v.locationId, supplierTermId: v.supplierTermId ?? NONE, supplierRef: v.supplierRef ?? '', lines: v.lines.map(l => ({ stockItemId: l.stockItemId, packs: l.packs, looseUnits: l.looseUnits, packCostMinor: l.packCostMinor })) }
    : { locationId: d.locations.length === 1 ? d.locations[0]!.id : '', supplierTermId: NONE, supplierRef: '', lines: [] }
}, { immediate: true })
// Chosen by width after hydration, so a line's fields are never on the page twice.
const phone = useScreenQuery('(max-width: 639px)')
const received = computed(() => data.value?.delivery?.state === 'received')

const itemOf = (itemId: string) => data.value?.items.find(i => i.id === itemId)
const locationItems = computed(() => (data.value?.locations ?? []).map(l => ({ value: l.id, label: l.name })))
const supplierItems = computed(() => [{ value: NONE, label: t('bar.screens.deliveries.no-supplier') }, ...(data.value?.suppliers ?? []).map(s => ({ value: s.id, label: s.label }))])
// A supplier typed that is not on the list is added to it, and chosen.
const addingSupplier = ref(false)
async function addSupplier(label: string) {
  refusal.value = null
  addingSupplier.value = true
  try {
    const made = await $api<{ supplierTermId: string }>('/api/bar/stock/suppliers', { method: 'POST', body: { label } })
    data.value?.suppliers.push({ id: made.supplierTermId, label: label.trim() })
    form.value.supplierTermId = made.supplierTermId
    toast.add({ title: t('bar.screens.deliveries.supplier-added', { name: label.trim() }), color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    addingSupplier.value = false
  }
}
// The item picker ticks what is on the delivery: ticking adds a line, unticking takes it off.
const itemChoices = computed(() => (data.value?.items ?? []).map(i => ({ value: i.id, label: i.name })))
const onDelivery = computed(() => form.value.lines.map(l => l.stockItemId))
function pick(itemIds: string[]) {
  const kept = form.value.lines.filter(l => itemIds.includes(l.stockItemId))
  const added = itemIds.filter(i => !kept.some(l => l.stockItemId === i)).map(stockItemId => ({ stockItemId, packs: 1, looseUnits: 0, packCostMinor: null }))
  form.value.lines = [...kept, ...added]
}
const removeLine = (itemId: string) => { form.value.lines = form.value.lines.filter(l => l.stockItemId !== itemId) }

function arriving(line: Line): string {
  const item = itemOf(line.stockItemId)
  if (!item) return ''
  return amount(item, (line.packs || 0) * item.packSize + (line.looseUnits || 0))
}
const locationName = computed(() => data.value?.locations.find(l => l.id === form.value.locationId)?.name ?? '')

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
const body = () => ({
  locationId: form.value.locationId,
  supplierTermId: form.value.supplierTermId === NONE ? null : form.value.supplierTermId,
  supplierRef: form.value.supplierRef.trim() || null,
  lines: form.value.lines.map(l => ({ stockItemId: l.stockItemId, packs: l.packs || 0, looseUnits: l.looseUnits || 0, packCostMinor: l.packCostMinor })),
})
/** Saves the draft, making it first if it is new, and answers its id. */
async function saveDraft(): Promise<string> {
  if (isNew.value) {
    const made = await $api<{ deliveryId: string }>('/api/bar/stock/deliveries', { method: 'POST', body: body() })
    return made.deliveryId
  }
  await $api(`/api/bar/stock/deliveries/${id.value}` as string, { method: 'PATCH', body: body() })
  return id.value
}
const formEl = useTemplateRef<{ validate: () => Promise<unknown> }>('formEl')
// Receiving is final, so it is asked about first, naming what arrives and where.
async function receive() {
  try {
    await formEl.value?.validate()
  }
  catch {
    return
  }
  const SHOWN = 6 // not-policy: how many lines the question names before "and more"
  const what = form.value.lines.slice(0, SHOWN).map(l => `${arriving(l)} ${itemOf(l.stockItemId)?.name ?? ''}`)
  const more = form.value.lines.length - SHOWN
  const ok = await confirm({
    verb: t('bar.screens.deliveries.receive-verb'),
    thing: t('bar.screens.deliveries.receive-thing', { count: form.value.lines.length, location: locationName.value }),
    consequence: t('bar.screens.deliveries.receive-consequence', { what: more > 0 ? t('bar.screens.deliveries.and-more', { list: what.join('; '), count: more }) : what.join('; ') }),
    button: t('bar.screens.deliveries.receive', { count: form.value.lines.length, location: locationName.value }),
  })
  if (ok) await run('receive')
}
async function run(act: 'save' | 'receive') {
  refusal.value = null
  busy.value = true
  try {
    const deliveryId = await saveDraft()
    if (act === 'receive') {
      await $api(`/api/bar/stock/deliveries/${deliveryId}/receive` as string, { method: 'POST', body: {} })
      toast.add({ title: t('bar.screens.deliveries.received', { location: locationName.value }), color: 'success' })
    }
    else {
      toast.add({ title: t('bar.screens.deliveries.saved'), color: 'success' })
    }
    if (isNew.value) await router.replace(`/console/bar/deliveries/${deliveryId}`)
    else await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
async function discard() {
  const ok = await confirm({ verb: t('bar.screens.deliveries.discard'), thing: t('bar.screens.deliveries.this-draft'), consequence: t('bar.screens.deliveries.discard-consequence'), button: t('bar.screens.deliveries.discard') })
  if (!ok) return
  try {
    await $api(`/api/bar/stock/deliveries/${id.value}` as string, { method: 'DELETE', body: {} })
    await router.push('/console/bar/deliveries')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const validate = () => needs({ locationId: form.value.locationId })

// Has the label changed? A due item's label is read again here, with the new stock to hand: each
// item on the delivery whose label is due, before it is received and after. A label checked here
// leaves the list without reloading the form, so lines not saved yet stay.
const checking = ref<{ title: string, endpoint: string, contains: string[], mayContain: string[], stockItemId: string } | null>(null)
const checked = ref<string[]>([])
const labelsShown = computed(() => (data.value?.labelsDue ?? []).filter(d => !checked.value.includes(d.stockItemId)
  && (received.value ? data.value!.delivery!.lines : form.value.lines).some(l => l.stockItemId === d.stockItemId)))
async function checkLabel(due: LabelDue) {
  const read = await $api<{ answer: { contains: string[], mayContain: string[] } }>(`/api/bar/stock/items/${due.stockItemId}/allergens` as string)
  checking.value = { title: t('bar.screens.choices.allergens-of', { name: due.name }), endpoint: `/api/bar/stock/items/${due.stockItemId}/allergens`, contains: read.answer.contains, mayContain: read.answer.mayContain, stockItemId: due.stockItemId }
}
function labelChecked() {
  if (checking.value) checked.value.push(checking.value.stockItemId)
  checking.value = null
}
const columns = computed(() => [
  { id: 'item', header: t('bar.screens.deliveries.item') },
  { id: 'packs', header: t('bar.screens.deliveries.packs') },
  { id: 'loose', header: t('bar.screens.deliveries.loose') },
  { id: 'cost', header: t('bar.screens.deliveries.pack-cost') },
  { id: 'arriving', header: t('bar.screens.deliveries.arriving') },
  { id: 'remove' },
])
const title = computed(() => isNew.value
  ? t('bar.screens.deliveries.new')
  : received.value
    ? t('bar.screens.deliveries.received-title', { location: locationName.value, when: dateTime(data.value!.delivery!.receivedAt!) })
    : t('bar.screens.deliveries.draft-title', { location: locationName.value || t('bar.screens.deliveries.somewhere') }))
</script>

<template>
  <PageFrame
    :title="title"
    :trail="[{ label: t('bar.navigation.deliveries.label'), to: '/console/bar/deliveries' }]"
  >
    <template #status>
      <StatusBadge
        v-if="data?.delivery"
        :tone="received ? 'success' : 'warning'"
        :label="t(`bar.screens.deliveries.states.${data.delivery.state}`)"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div
          v-if="received && d.delivery"
          class="space-y-6"
        >
          <FactStrip
            :facts="[
              { label: t('bar.screens.deliveries.location'), value: locationName },
              { label: t('bar.screens.deliveries.supplier'), value: d.delivery.supplier ?? t('bar.screens.deliveries.no-supplier') },
              ...(d.delivery.supplierRef ? [{ label: t('bar.screens.deliveries.note-number'), value: d.delivery.supplierRef }] : []),
              { label: t('bar.screens.deliveries.received-by'), value: d.delivery.receivedBy ?? '' },
            ]"
          />
          <PageSection
            v-if="labelsShown.length"
            :title="t('bar.screens.deliveries.labels-due')"
            :description="t('bar.screens.deliveries.labels-due-help')"
          >
            <RecordList :label="t('bar.screens.deliveries.labels-due')">
              <RecordListItem
                v-for="due in labelsShown"
                :key="due.stockItemId"
                :name="due.name"
                :description="due.checkedAt ? t('bar.screens.deliveries.last-checked', { when: dateTime(due.checkedAt) }) : t('bar.screens.deliveries.never-checked')"
              >
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-clipboard-check"
                  :label="t('bar.screens.product.check-label')"
                  :aria-label="t('bar.screens.deliveries.check-label-of', { name: due.name })"
                  @click="checkLabel(due)"
                />
              </RecordListItem>
            </RecordList>
          </PageSection>
          <RecordList :label="t('bar.screens.deliveries.lines')">
            <RecordListItem
              v-for="l in d.delivery.lines"
              :key="l.stockItemId"
              :name="itemOf(l.stockItemId)?.name ?? ''"
              :description="l.packCostMinor !== null ? t('bar.screens.deliveries.cost-each', { amount: money(l.packCostMinor), pack: itemOf(l.stockItemId)?.packName ?? '' }) : undefined"
            >
              <span class="text-sm tabular-nums">{{ arriving(l) }}</span>
            </RecordListItem>
          </RecordList>
          <p class="text-sm text-muted">
            {{ t('bar.screens.deliveries.final') }}
          </p>
        </div>
        <UForm
          v-else
          id="bar-delivery"
          ref="formEl"
          :state="form"
          :validate="validate"
          class="space-y-6"
          novalidate
          @submit="run('save')"
        >
          <RefusalNotice :refusal="refusal" />
          <PageSection
            v-if="labelsShown.length"
            :title="t('bar.screens.deliveries.labels-due')"
            :description="t('bar.screens.deliveries.labels-due-help')"
          >
            <RecordList :label="t('bar.screens.deliveries.labels-due')">
              <RecordListItem
                v-for="due in labelsShown"
                :key="due.stockItemId"
                :name="due.name"
                :description="due.checkedAt ? t('bar.screens.deliveries.last-checked', { when: dateTime(due.checkedAt) }) : t('bar.screens.deliveries.never-checked')"
              >
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-clipboard-check"
                  :label="t('bar.screens.product.check-label')"
                  :aria-label="t('bar.screens.deliveries.check-label-of', { name: due.name })"
                  @click="checkLabel(due)"
                />
              </RecordListItem>
            </RecordList>
          </PageSection>
          <PageSection :title="t('bar.screens.deliveries.details')">
            <div class="grid gap-4 sm:grid-cols-3">
              <UFormField
                :label="t('bar.screens.deliveries.location')"
                :help="t('bar.screens.deliveries.location-help')"
                name="locationId"
                required
              >
                <USelect
                  v-model="form.locationId"
                  :items="locationItems"
                />
              </UFormField>
              <UFormField
                :label="t('bar.screens.deliveries.supplier')"
                :help="t('bar.screens.deliveries.supplier-help')"
                name="supplierTermId"
              >
                <USelectMenu
                  v-model="form.supplierTermId"
                  :items="supplierItems"
                  value-key="value"
                  create-item
                  :loading="addingSupplier"
                  @create="addSupplier"
                >
                  <template #create-item-label="{ item }">
                    {{ t('bar.screens.deliveries.add-supplier', { name: item }) }}
                  </template>
                </USelectMenu>
              </UFormField>
              <UFormField
                :label="t('bar.screens.deliveries.note-number')"
                name="supplierRef"
              >
                <UInput
                  v-model="form.supplierRef"
                  :maxlength="40"
                />
              </UFormField>
            </div>
          </PageSection>
          <PageSection
            :title="t('bar.screens.deliveries.lines')"
            :description="t('bar.screens.deliveries.lines-help')"
          >
            <template #actions>
              <USelectMenu
                :model-value="onDelivery"
                :items="itemChoices"
                value-key="value"
                multiple
                icon="i-lucide-plus"
                :search-input="{ placeholder: t('bar.screens.deliveries.find-item') }"
                :aria-label="t('bar.screens.deliveries.add-item')"
                class="min-w-48"
                @update:model-value="pick"
              >
                <template #default>
                  {{ t('bar.screens.deliveries.add-item') }}
                </template>
              </USelectMenu>
            </template>
            <!-- On a phone: one item a row, its fields under its name. -->
            <p
              v-if="!form.lines.length"
              class="text-sm text-muted"
            >
              {{ t('bar.screens.deliveries.no-lines') }}
            </p>
            <RecordList
              v-else-if="phone"
              :label="t('bar.screens.deliveries.lines')"
            >
              <RecordListItem
                v-for="l in form.lines"
                :key="l.stockItemId"
                :name="itemOf(l.stockItemId)?.name ?? ''"
                :description="arriving(l)"
              >
                <IconButton
                  icon="i-lucide-x"
                  :label="t('bar.screens.deliveries.remove', { name: itemOf(l.stockItemId)?.name ?? '' })"
                  @click="removeLine(l.stockItemId)"
                />
                <template #below>
                  <div class="grid grid-cols-2 gap-3">
                    <UFormField :label="t('bar.screens.deliveries.packs')">
                      <UFieldGroup>
                        <UInputNumber
                          v-model="l.packs"
                          :min="0"
                          size="lg"
                          :aria-label="t('bar.screens.deliveries.packs-of', { name: itemOf(l.stockItemId)?.name ?? '' })"
                        />
                        <UBadge
                          color="neutral"
                          variant="outline"
                          size="lg"
                          :label="itemOf(l.stockItemId)?.packName ?? ''"
                        />
                      </UFieldGroup>
                    </UFormField>
                    <UFormField :label="t('bar.screens.deliveries.loose')">
                      <UFieldGroup>
                        <UInputNumber
                          v-model="l.looseUnits"
                          :min="0"
                          size="lg"
                          :aria-label="t('bar.screens.deliveries.loose-of', { name: itemOf(l.stockItemId)?.name ?? '' })"
                        />
                        <UBadge
                          color="neutral"
                          variant="outline"
                          size="lg"
                          :label="t(`bar.screens.stock.units.${itemOf(l.stockItemId)?.baseUnit ?? 'each'}`)"
                        />
                      </UFieldGroup>
                    </UFormField>
                    <UFormField
                      :label="t('bar.screens.deliveries.pack-cost')"
                      class="col-span-2"
                    >
                      <FieldMoney
                        v-model="l.packCostMinor"
                        :steppers="false"
                        :placeholder="itemOf(l.stockItemId)?.costMinor != null ? money(itemOf(l.stockItemId)!.costMinor!) : undefined"
                        :aria-label="t('bar.screens.deliveries.cost-of', { name: itemOf(l.stockItemId)?.name ?? '' })"
                      />
                    </UFormField>
                  </div>
                </template>
              </RecordListItem>
            </RecordList>
            <UTable
              v-else
              :data="form.lines"
              :columns="columns"
              :caption="t('bar.screens.deliveries.lines')"
            >
              <template #item-cell="{ row }">
                <span class="font-medium">{{ itemOf(row.original.stockItemId)?.name }}</span>
              </template>
              <template #packs-cell="{ row }">
                <UFieldGroup>
                  <UInputNumber
                    v-model="row.original.packs"
                    :min="0"
                    :aria-label="t('bar.screens.deliveries.packs-of', { name: itemOf(row.original.stockItemId)?.name ?? '' })"
                  />
                  <UBadge
                    color="neutral"
                    variant="outline"
                    size="lg"
                    :label="itemOf(row.original.stockItemId)?.packName ?? ''"
                  />
                </UFieldGroup>
              </template>
              <template #loose-cell="{ row }">
                <UFieldGroup>
                  <UInputNumber
                    v-model="row.original.looseUnits"
                    :min="0"
                    :aria-label="t('bar.screens.deliveries.loose-of', { name: itemOf(row.original.stockItemId)?.name ?? '' })"
                  />
                  <UBadge
                    color="neutral"
                    variant="outline"
                    size="lg"
                    :label="t(`bar.screens.stock.units.${itemOf(row.original.stockItemId)?.baseUnit ?? 'each'}`)"
                  />
                </UFieldGroup>
              </template>
              <template #cost-cell="{ row }">
                <FieldMoney
                  v-model="row.original.packCostMinor"
                  :steppers="false"
                  :placeholder="itemOf(row.original.stockItemId)?.costMinor != null ? money(itemOf(row.original.stockItemId)!.costMinor!) : undefined"
                  :aria-label="t('bar.screens.deliveries.cost-of', { name: itemOf(row.original.stockItemId)?.name ?? '' })"
                />
              </template>
              <template #arriving-cell="{ row }">
                <span class="tabular-nums">{{ arriving(row.original) }}</span>
              </template>
              <template #remove-cell="{ row }">
                <IconButton
                  icon="i-lucide-x"
                  :label="t('bar.screens.deliveries.remove', { name: itemOf(row.original.stockItemId)?.name ?? '' })"
                  @click="removeLine(row.original.stockItemId)"
                />
              </template>
            </UTable>
          </PageSection>
        </UForm>
      </template>
    </DataBoundary>
    <template
      v-if="data && !received"
      #footer
    >
      <div class="flex flex-wrap gap-2">
        <UButton
          :loading="busy"
          :label="form.lines.length && locationName ? t('bar.screens.deliveries.receive', { count: form.lines.length, location: locationName }) : t('bar.screens.deliveries.receive-plain')"
          @click="receive"
        />
        <UButton
          type="submit"
          form="bar-delivery"
          color="neutral"
          variant="outline"
          :loading="busy"
          :label="t('bar.screens.deliveries.save-draft')"
        />
        <UButton
          v-if="!isNew"
          color="error"
          variant="ghost"
          :label="t('bar.screens.deliveries.discard')"
          @click="discard"
        />
      </div>
    </template>
    <BarAllergenDialog
      :target="checking"
      :help="t('bar.screens.stock.allergens-help')"
      @close="checking = null"
      @saved="labelChecked"
    />
  </PageFrame>
</template>
