<!-- A delivery (S9). A draft: where it goes, the supplier and the delivery note number, then a line per
     item with packs, loose units and the pack cost if it changed. Receiving it moves the stock in at
     once and is final; a mistake is put right by another delivery, by wastage or at the next count.
     A received delivery is its record. "new" starts one. -->
<script setup lang="ts">
type Unit = 'each' | 'ml' | 'g'
interface FormItem { id: string, name: string, baseUnit: Unit, packSize: number, packName: string, countUnitSize: number, costMinor: number | null }
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
const toast = useToast()

const id = computed(() => route.params.id as string)
const isNew = computed(() => id.value === 'new')
const { data, status, error, refresh } = await useAPI<FormData & { delivery?: Delivery }>(
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
const received = computed(() => data.value?.delivery?.state === 'received')

const itemOf = (itemId: string) => data.value?.items.find(i => i.id === itemId)
const locationItems = computed(() => (data.value?.locations ?? []).map(l => ({ value: l.id, label: l.name })))
const supplierItems = computed(() => [{ value: NONE, label: t('bar.screens.deliveries.no-supplier') }, ...(data.value?.suppliers ?? []).map(s => ({ value: s.id, label: s.label }))])
const addable = computed(() => (data.value?.items ?? []).filter(i => !form.value.lines.some(l => l.stockItemId === i.id)).map(i => ({ value: i.id, label: i.name })))
const adding = ref<string | undefined>(undefined)
watch(adding, (itemId) => {
  if (!itemId) return
  form.value.lines.push({ stockItemId: itemId, packs: 1, looseUnits: 0, packCostMinor: null })
  adding.value = undefined
})
const removeLine = (itemId: string) => { form.value.lines = form.value.lines.filter(l => l.stockItemId !== itemId) }

const number = (n: number, digits = 2) => n.toLocaleString(undefined, { maximumFractionDigits: digits })
function arriving(line: Line): string {
  const item = itemOf(line.stockItemId)
  if (!item) return ''
  const quantity = (line.packs || 0) * item.packSize + (line.looseUnits || 0)
  const base = `${number(quantity, 0)} ${t(`bar.screens.stock.units.${item.baseUnit}`)}`
  return item.countUnitSize === 1 ? base : t('bar.screens.stock.counted', { count: number(quantity / item.countUnitSize), base })
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
const columns = computed(() => [
  { id: 'item', header: t('bar.screens.deliveries.item') },
  { id: 'packs', header: t('bar.screens.deliveries.packs') },
  { id: 'loose', header: t('bar.screens.deliveries.loose') },
  { id: 'cost', header: t('bar.screens.deliveries.pack-cost') },
  { id: 'arriving', header: t('bar.screens.deliveries.arriving') },
  { id: 'remove', header: '' },
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
              { label: t('bar.screens.deliveries.supplier'), value: [d.delivery.supplier, d.delivery.supplierRef].filter(Boolean).join(' · ') || t('bar.screens.deliveries.no-supplier') },
              { label: t('bar.screens.deliveries.received-by'), value: d.delivery.receivedBy ?? '' },
            ]"
          />
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
          :state="form"
          :validate="validate"
          class="space-y-6"
          novalidate
          @submit="run('receive')"
        >
          <RefusalNotice :refusal="refusal" />
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
                :help="d.suppliers.length ? undefined : t('bar.screens.deliveries.supplier-help')"
                name="supplierTermId"
              >
                <USelectMenu
                  v-model="form.supplierTermId"
                  :items="supplierItems"
                  value-key="value"
                />
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
                v-model="adding"
                :items="addable"
                value-key="value"
                icon="i-lucide-plus"
                :placeholder="t('bar.screens.deliveries.add-item')"
              />
            </template>
            <p
              v-if="!form.lines.length"
              class="text-sm text-muted"
            >
              {{ t('bar.screens.deliveries.no-lines') }}
            </p>
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
          type="submit"
          form="bar-delivery"
          :loading="busy"
          :label="t('bar.screens.deliveries.receive', { count: form.lines.length, location: locationName || t('bar.screens.deliveries.somewhere') })"
        />
        <UButton
          color="neutral"
          variant="outline"
          :loading="busy"
          :label="t('bar.screens.deliveries.save-draft')"
          @click="run('save')"
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
  </PageFrame>
</template>
