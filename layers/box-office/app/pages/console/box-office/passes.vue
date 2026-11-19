<!-- Passes (BO-64; mock-up approved by Matt 2026-11-18): make a pass, say what it covers, give it its
     own prices and put it on sale. A pass gives one entry at each performance it covers and is not
     tied to ticket types. Rarely changed choices sit under More options; retired passes fold away. -->
<script setup lang="ts">
type Covers = 'productions' | 'season' | 'dates'
type Channel = 'all' | 'desk' | 'online'
type Holder = 'auto' | 'named' | 'open'
interface PassPrice { id: string, name: string, amountMinor: number, requirementRefs: string[], proofNote: string | null, insteadOf: string[], active: boolean, sold: number }
interface PassType { id: string, name: string, description: string | null, covers: Covers, seasonId: string | null, coversFrom: number | null, coversUntil: number | null, productionIds: string[], perShow: 'once' | 'any', uses: number | null, holder: Holder, reserveUnpaid: boolean, recheck: boolean, channel: Channel, onSale: boolean, saleFrom: number | null, saleUntil: number | null, active: boolean, prices: PassPrice[], held: number, unpaid: number }
interface Listing { rows: PassType[], productions: { id: string, title: string }[], seasons: { id: string, name: string }[], requirementOptions: { value: string, label: string }[], requirementLabels: Record<string, string>, ticketTypes: { value: string, label: string }[] }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { offer } = useUndo()
const { money } = await useMoney()
const { day } = useDates()
const { data, status, error, refresh } = await useAPI<Listing>('/api/box-office/pass-types', { key: 'box-office:pass-types' })

const active = computed(() => (data.value?.rows ?? []).filter(p => p.active))
const retired = computed(() => (data.value?.rows ?? []).filter(p => !p.active))
const retiredOpen = ref(false)
const productionItems = computed(() => (data.value?.productions ?? []).map(p => ({ value: p.id, label: p.title })))
const seasonItems = computed(() => (data.value?.seasons ?? []).map(s => ({ value: s.id, label: s.name })))
const whoItems = computed(() => data.value?.requirementOptions ?? [])
const insteadItems = computed(() => data.value?.ticketTypes ?? [])
const coversItems = computed(() => (['productions', 'season', 'dates'] as const).map(value => ({ value, label: t(`box-office.passes.covers.${value}`) })))
const perShowItems = computed(() => (['once', 'any'] as const).map(value => ({ value, label: t(`box-office.passes.per-show.${value}`), description: t(`box-office.passes.per-show.${value}-help`) })))
const holderItems = computed(() => (['auto', 'named', 'open'] as const).map(value => ({ value, label: t(`box-office.passes.holder.${value}`) })))
const channelItems = computed(() => (['all', 'desk', 'online'] as const).map(value => ({ value, label: t(`box-office.passes.channel.${value}`) })))

function describe(p: PassType) {
  const covers = p.covers === 'productions'
    ? t('box-office.passes.words.shows', { count: p.productionIds.length })
    : p.covers === 'season'
      ? t('box-office.passes.words.season', { season: data.value?.seasons.find(s => s.id === p.seasonId)?.name ?? '' })
      : t('box-office.passes.words.dates', { from: day(p.coversFrom ?? 0), until: day(p.coversUntil ?? 0) })
  return [
    covers,
    t(`box-office.passes.words.${p.perShow}`),
    p.uses !== null ? t('box-office.passes.words.uses', { count: p.uses }) : null,
    p.prices.filter(price => price.active).map(price => t('box-office.passes.words.price', { name: price.name, amount: money(price.amountMinor) })).join(', '),
    p.held ? t('box-office.passes.words.held', { count: p.held }) : null,
    p.unpaid ? t('box-office.passes.words.unpaid', { count: p.unpaid }) : null,
  ].filter(Boolean).join(' · ')
}

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function run<T>(fn: () => Promise<T>, done: string, undo?: (result: T) => Promise<unknown>, onRefusal = refusal) {
  onRefusal.value = null
  try {
    const result = await fn()
    await refresh()
    offer(done, undo && (async () => {
      await undo(result)
      await refresh()
    }))
    return true
  }
  catch (e) {
    onRefusal.value = toRefusal(e)
    return false
  }
}

interface PriceForm { id?: string, name: string, amountMinor: number | null, requirementRefs: string[], proofNote: string | null, insteadOf: string[], active: boolean }
interface Form { name: string, description: string, covers: Covers, productionIds: string[], seasonId: string | undefined, coversFrom: number | null, coversUntil: number | null, perShow: 'once' | 'any', uses: number | null, holder: Holder, reserveUnpaid: boolean, recheck: boolean, channel: Channel, onSale: boolean, saleFrom: number | null, saleUntil: number | null, prices: PriceForm[] }
const blankPrice = (): PriceForm => ({ name: '', amountMinor: null, requirementRefs: [], proofNote: null, insteadOf: [], active: true })
const blank = (): Form => ({
  name: '', description: '', covers: 'productions', productionIds: [], seasonId: undefined, coversFrom: null, coversUntil: null,
  perShow: 'once', uses: null, holder: 'auto', reserveUnpaid: true, recheck: false, channel: 'all', onSale: false, saleFrom: null, saleUntil: null,
  prices: [blankPrice()],
})
const form = ref<Form>(blank())
const editing = ref(false)
const editId = ref<string | null>(null)
const moreOpen = ref(false)
const formRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
const asForm = (p: PassType): Form => ({
  name: p.name, description: p.description ?? '', covers: p.covers, productionIds: [...p.productionIds], seasonId: p.seasonId ?? undefined, coversFrom: p.coversFrom, coversUntil: p.coversUntil,
  perShow: p.perShow, uses: p.uses, holder: p.holder, reserveUnpaid: p.reserveUnpaid, recheck: p.recheck, channel: p.channel, onSale: p.onSale, saleFrom: p.saleFrom, saleUntil: p.saleUntil,
  prices: p.prices.filter(price => price.active).map(price => ({ id: price.id, name: price.name, amountMinor: price.amountMinor, requirementRefs: [...price.requirementRefs], proofNote: price.proofNote, insteadOf: [...price.insteadOf], active: true })),
})
const asBody = (f: Form) => ({
  name: f.name.trim(), description: f.description.trim() || null, covers: f.covers,
  productionIds: f.covers === 'productions' ? f.productionIds : [], seasonId: f.covers === 'season' ? f.seasonId ?? null : null,
  coversFrom: f.coversFrom, coversUntil: f.coversUntil, perShow: f.perShow, uses: f.uses ?? null,
  holder: f.holder, reserveUnpaid: f.reserveUnpaid, recheck: f.recheck, channel: f.channel, onSale: f.onSale, saleFrom: f.saleFrom, saleUntil: f.saleUntil,
  prices: f.prices.map(p => ({ ...(p.id ? { id: p.id } : {}), name: p.name.trim(), amountMinor: p.amountMinor ?? 0, requirementRefs: p.requirementRefs, proofNote: p.proofNote, insteadOf: p.insteadOf, active: p.active })),
})
// More options opens by itself when a pass being edited has one of them changed from the usual.
const unusual = (f: Form) => f.holder !== 'auto' || !f.reserveUnpaid || f.recheck || f.channel !== 'all' || f.uses !== null || f.saleFrom !== null || f.saleUntil !== null || (f.covers !== 'dates' && (f.coversFrom !== null || f.coversUntil !== null))
function open(p?: PassType) {
  editId.value = p?.id ?? null
  form.value = p ? asForm(p) : blank()
  moreOpen.value = unusual(form.value)
  formRefusal.value = null
  editing.value = true
}
function validate(f: Form) {
  const errors = needs({ name: f.name.trim() })
  if (f.covers === 'productions' && !f.productionIds.length) errors.push({ name: 'productionIds', message: t('box-office.passes.field.productions-placeholder') })
  if (f.covers === 'season' && !f.seasonId) errors.push({ name: 'seasonId', message: t('box-office.passes.field.season-placeholder') })
  if (f.covers === 'dates') errors.push(...needs({ coversFrom: f.coversFrom, coversUntil: f.coversUntil }))
  f.prices.forEach((p, i) => {
    if (!p.name.trim()) errors.push({ name: `prices.${i}.name`, message: t('box-office.passes.field.price-name-needed') })
    if (p.amountMinor === null) errors.push({ name: `prices.${i}.amountMinor`, message: t('box-office.passes.field.price-amount-needed') })
  })
  return errors
}

const url = (id: string) => `/api/box-office/pass-types/${encodeURIComponent(id)}`
const setState = (id: string, body: { active?: boolean, onSale?: boolean }) => $api(`${url(id)}/state`, { method: 'POST', body })
async function save() {
  const body = asBody(form.value)
  const id = editId.value
  const ok = id
    ? await run(() => $api(url(id), { method: 'PUT', body }), t('box-office.passes.saved', { name: body.name }), undefined, formRefusal)
    : await run(() => $api<{ id: string }>('/api/box-office/pass-types', { method: 'POST', body }), t('box-office.passes.added', { name: body.name }), made => setState(made.id, { active: false }), formRefusal)
  if (ok) editing.value = false
}
const setActive = (p: PassType, on: boolean) => run(() => setState(p.id, { active: on }), t(on ? 'box-office.passes.restored' : 'box-office.passes.retired', { name: p.name }), () => setState(p.id, { active: !on }))
const setOnSale = (p: PassType, on: boolean) => run(() => setState(p.id, { onSale: on }), t(on ? 'box-office.passes.on-sale' : 'box-office.passes.off-sale', { name: p.name }), () => setState(p.id, { onSale: !on }))
const holdersOf = ref<PassType | null>(null)
const actions = (p: PassType) => [[
  { label: t('box-office.passes.holders.open'), icon: 'i-lucide-users-round', onSelect: () => { holdersOf.value = p } },
  { label: t('box-office.passes.edit'), icon: 'i-lucide-pencil', onSelect: () => open(p) },
  ...(p.active
    ? [p.onSale
        ? { label: t('box-office.passes.take-off-sale'), icon: 'i-lucide-pause', onSelect: () => setOnSale(p, false) }
        : { label: t('box-office.passes.put-on-sale'), icon: 'i-lucide-play', onSelect: () => setOnSale(p, true) }]
    : []),
  p.active
    ? { label: t('box-office.passes.retire'), icon: 'i-lucide-archive', onSelect: () => setActive(p, false) }
    : { label: t('box-office.passes.restore'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(p, true) },
]]
</script>

<template>
  <PageFrame
    :title="t('box-office.navigation.passes.label')"
    :description="t('box-office.passes.description')"
    width="reading"
  >
    <template #primary>
      <UButton
        :label="t('box-office.passes.new')"
        icon="i-lucide-plus"
        @click="open()"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="space-y-4">
        <RefusalNotice
          v-if="!editing"
          :refusal="refusal"
        />
        <EmptyState
          v-if="!data?.rows.length"
          :title="t('box-office.passes.empty.title')"
          :description="t('box-office.passes.empty.description')"
          icon="i-lucide-id-card"
        />
        <RecordList
          v-if="active.length"
          :label="t('box-office.navigation.passes.label')"
        >
          <RecordListItem
            v-for="p in active"
            :key="p.id"
            :name="p.name"
            :description="describe(p)"
          >
            <UBadge
              :label="t(p.onSale ? 'box-office.passes.badge.on-sale' : 'box-office.passes.badge.off-sale')"
              :color="p.onSale ? 'success' : 'neutral'"
              variant="subtle"
            />
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-lucide-users-round"
              :label="t('box-office.passes.holders.button', { count: p.held })"
              @click="holdersOf = p"
            />
            <RowActions
              :items="actions(p)"
              :label="t('box-office.passes.actions', { name: p.name })"
            />
          </RecordListItem>
        </RecordList>
        <CollapsibleDivider
          v-model:open="retiredOpen"
          :label="t('box-office.passes.retired-heading')"
          :count="retired.length"
        >
          <RecordList :label="t('box-office.passes.retired-heading')">
            <RecordListItem
              v-for="p in retired"
              :key="p.id"
              :name="p.name"
              :description="describe(p)"
              muted
            >
              <RowActions
                :items="actions(p)"
                :label="t('box-office.passes.actions', { name: p.name })"
              />
            </RecordListItem>
          </RecordList>
        </CollapsibleDivider>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="editing"
      :title="editId ? t('box-office.passes.edit-title') : t('box-office.passes.new')"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <UForm
          id="pass-form"
          :state="form"
          :validate="validate"
          class="space-y-5"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="formRefusal" />
          <UFormField
            :label="t('box-office.passes.field.name')"
            name="name"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="80"
              class="w-80"
            />
          </UFormField>
          <UFormField
            :label="t('box-office.passes.field.description')"
            :help="t('box-office.passes.field.description-help')"
            name="description"
          >
            <UTextarea
              v-model="form.description"
              :rows="2"
              maxlength="600"
              autoresize
            />
          </UFormField>

          <UFormField
            :label="t('box-office.passes.field.covers')"
            name="covers"
          >
            <USelect
              v-model="form.covers"
              :items="coversItems"
              class="w-72"
            />
          </UFormField>
          <UFormField
            v-if="form.covers === 'productions'"
            :label="t('box-office.passes.field.productions')"
            name="productionIds"
            required
          >
            <USelectMenu
              v-model="form.productionIds"
              :items="productionItems"
              :placeholder="t('box-office.passes.field.productions-placeholder')"
              value-key="value"
              multiple
            />
          </UFormField>
          <UFormField
            v-else-if="form.covers === 'season'"
            :label="t('box-office.passes.field.season')"
            name="seasonId"
            required
          >
            <USelectMenu
              v-model="form.seasonId"
              :items="seasonItems"
              :placeholder="t('box-office.passes.field.season-placeholder')"
              value-key="value"
              class="w-72"
            />
          </UFormField>
          <div
            v-else
            class="flex flex-wrap gap-4"
          >
            <UFormField
              :label="t('box-office.passes.field.covers-from')"
              name="coversFrom"
              required
            >
              <FieldDateTime v-model="form.coversFrom" />
            </UFormField>
            <UFormField
              :label="t('box-office.passes.field.covers-until')"
              name="coversUntil"
              required
            >
              <FieldDateTime v-model="form.coversUntil" />
            </UFormField>
          </div>

          <UFormField
            :label="t('box-office.passes.section.prices')"
            :help="t('box-office.passes.field.prices-help')"
          >
            <div class="space-y-3">
              <div
                v-for="(price, i) in form.prices"
                :key="price.id ?? `new-${i}`"
                class="flex flex-wrap items-start gap-2"
              >
                <UFormField
                  :label="t('box-office.passes.field.price-name')"
                  :name="`prices.${i}.name`"
                  :ui="{ label: i ? 'sr-only' : '' }"
                  class="w-44"
                >
                  <UInput
                    v-model="price.name"
                    maxlength="60"
                  />
                </UFormField>
                <UFormField
                  :label="t('box-office.passes.field.price-amount')"
                  :name="`prices.${i}.amountMinor`"
                  :ui="{ label: i ? 'sr-only' : '' }"
                  class="w-28"
                >
                  <FieldMoney
                    v-model="price.amountMinor"
                    :steppers="false"
                  />
                </UFormField>
                <UFormField
                  v-if="whoItems.length"
                  :label="t('box-office.passes.field.price-who')"
                  :name="`prices.${i}.requirementRefs`"
                  :ui="{ label: i ? 'sr-only' : '' }"
                  class="min-w-0 flex-1 basis-40"
                >
                  <USelectMenu
                    v-model="price.requirementRefs"
                    :items="whoItems"
                    :placeholder="t('box-office.passes.field.price-anyone')"
                    :search-input="false"
                    value-key="value"
                    multiple
                  />
                </UFormField>
                <UFormField
                  v-if="insteadItems.length"
                  :label="t('box-office.passes.field.price-instead')"
                  :name="`prices.${i}.insteadOf`"
                  :ui="{ label: i ? 'sr-only' : '' }"
                  class="min-w-0 flex-1 basis-40"
                >
                  <USelectMenu
                    v-model="price.insteadOf"
                    :items="insteadItems"
                    :placeholder="t('box-office.passes.field.price-instead-none')"
                    :search-input="false"
                    value-key="value"
                    multiple
                  />
                </UFormField>
                <IconButton
                  v-if="form.prices.length > 1"
                  icon="i-lucide-x"
                  :class="i ? '' : 'mt-6'"
                  :label="price.name ? t('box-office.passes.field.price-remove', { name: price.name }) : t('box-office.passes.field.price-remove-new')"
                  @click="form.prices.splice(i, 1)"
                />
              </div>
              <UButton
                :label="t('box-office.passes.field.price-add')"
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                size="sm"
                @click="form.prices.push(blankPrice())"
              />
            </div>
          </UFormField>

          <UFormField
            :label="t('box-office.passes.field.per-show')"
            name="perShow"
          >
            <URadioGroup
              v-model="form.perShow"
              :items="perShowItems"
            />
          </UFormField>
          <UFormField name="onSale">
            <USwitch
              v-model="form.onSale"
              :label="t('box-office.passes.field.on-sale')"
            />
          </UFormField>

          <UCollapsible v-model:open="moreOpen">
            <UButton
              color="neutral"
              variant="link"
              :icon="moreOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              :label="t('box-office.passes.more')"
              class="px-0"
            />
            <template #content>
              <div class="space-y-5 pt-4">
                <UFormField
                  :label="t('box-office.passes.field.uses')"
                  :help="t('box-office.passes.field.uses-help')"
                  name="uses"
                >
                  <UInputNumber
                    :model-value="form.uses ?? undefined"
                    :min="1"
                    class="w-32"
                    @update:model-value="form.uses = $event ?? null"
                  />
                </UFormField>
                <UFormField
                  :label="t('box-office.passes.field.holder')"
                  name="holder"
                >
                  <USelect
                    v-model="form.holder"
                    :items="holderItems"
                  />
                </UFormField>
                <UFormField name="reserveUnpaid">
                  <UCheckbox
                    v-model="form.reserveUnpaid"
                    :label="t('box-office.passes.field.reserve-unpaid')"
                    :description="t('box-office.passes.field.reserve-unpaid-help')"
                  />
                </UFormField>
                <UFormField name="recheck">
                  <UCheckbox
                    v-model="form.recheck"
                    :label="t('box-office.passes.field.recheck')"
                    :description="t('box-office.passes.field.recheck-help')"
                  />
                </UFormField>
                <UFormField
                  :label="t('box-office.passes.field.channel')"
                  name="channel"
                >
                  <USelect
                    v-model="form.channel"
                    :items="channelItems"
                    class="w-72"
                  />
                </UFormField>
                <div class="flex flex-wrap gap-4">
                  <UFormField
                    :label="t('box-office.passes.field.sale-from')"
                    :help="t('box-office.passes.field.sale-help')"
                    name="saleFrom"
                  >
                    <FieldDateTime v-model="form.saleFrom" />
                  </UFormField>
                  <UFormField
                    :label="t('box-office.passes.field.sale-until')"
                    name="saleUntil"
                  >
                    <FieldDateTime v-model="form.saleUntil" />
                  </UFormField>
                </div>
                <div
                  v-if="form.covers !== 'dates'"
                  class="flex flex-wrap gap-4"
                >
                  <UFormField
                    :label="t('box-office.passes.field.covers-from')"
                    :help="t('box-office.passes.field.covers-window-help')"
                    name="coversFrom"
                  >
                    <FieldDateTime v-model="form.coversFrom" />
                  </UFormField>
                  <UFormField
                    :label="t('box-office.passes.field.covers-until')"
                    name="coversUntil"
                  >
                    <FieldDateTime v-model="form.coversUntil" />
                  </UFormField>
                </div>
              </div>
            </template>
          </UCollapsible>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="pass-form"
          :label="t('box-office.passes.save')"
        />
      </template>
    </UModal>
    <BoxOfficePassHolders
      :pass="holdersOf"
      @close="holdersOf = null"
      @changed="refresh()"
    />
  </PageFrame>
</template>
