<!-- Promo codes (Box office specification, part 6; BO-17): make a code, limit it, retire it, and see
     how often it has been used. A code takes a percentage or an amount off, or sets a price, on the
     tickets it is for. Retired codes fold away under a divider. -->
<script setup lang="ts">
type Effect = 'percent_off' | 'amount_off' | 'set_price'
interface PromoCode { id: string, code: string, effect: Effect, value: number, productionId: string | null, performanceId: string | null, ticketTypeId: string | null, bandId: string | null, maxUses: number | null, used: number, maxPerOrder: number | null, validFrom: number | null, validUntil: number | null, active: boolean, note: string | null }
interface Production { id: string, title: string, performances: { id: string, startsAt: number }[], bands: { id: string, name: string }[] }
interface Listing { rows: PromoCode[], productions: Production[], ticketTypes: { id: string, name: string }[] }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { offer } = useUndo()
const { money } = await useMoney()
const { dateTime } = useDates()
const { data, status, error, refresh } = await useAPI<Listing>('/api/box-office/promo-codes', { key: 'box-office:promo-codes' })

const ANY = '__any'
const effects = computed(() => (['percent_off', 'amount_off', 'set_price'] as const).map(value => ({ value, label: t(`box-office.codes.effect.${value}`) })))
const productionItems = computed(() => [{ value: ANY, label: t('box-office.codes.any-production') }, ...(data.value?.productions ?? []).map(p => ({ value: p.id, label: p.title }))])
// A code can be narrowed to one performance or one section only within a production.
const picked = computed(() => data.value?.productions.find(p => p.id === form.value.productionId))
const performanceItems = computed(() => [{ value: ANY, label: t('box-office.codes.any-performance') }, ...(picked.value?.performances ?? []).map(p => ({ value: p.id, label: dateTime(p.startsAt) }))])
const bandItems = computed(() => [{ value: ANY, label: t('box-office.codes.any-band') }, ...(picked.value?.bands ?? []).map(b => ({ value: b.id, label: b.name }))])
const typeItems = computed(() => [{ value: ANY, label: t('box-office.codes.any-type') }, ...(data.value?.ticketTypes ?? []).map(type => ({ value: type.id, label: type.name }))])
const active = computed(() => (data.value?.rows ?? []).filter(c => c.active))
const retired = computed(() => (data.value?.rows ?? []).filter(c => !c.active))
const retiredOpen = ref(false)

function effectWords(c: Pick<PromoCode, 'effect' | 'value'>) {
  if (c.effect === 'percent_off') return t('box-office.codes.words.percent_off', { percent: c.value / 100 })
  return t(`box-office.codes.words.${c.effect}`, { amount: money(c.value) })
}
const productionOf = (c: PromoCode) => data.value?.productions.find(p => p.id === c.productionId)
function describe(c: PromoCode) {
  const scope = [
    c.productionId ? productionOf(c)?.title : null,
    c.performanceId ? dateTime(productionOf(c)?.performances.find(p => p.id === c.performanceId)?.startsAt ?? 0) : null,
    c.bandId ? productionOf(c)?.bands.find(b => b.id === c.bandId)?.name : null,
    c.ticketTypeId ? data.value?.ticketTypes.find(type => type.id === c.ticketTypeId)?.name : null,
  ].filter(Boolean).join(', ')
  return [
    effectWords(c),
    scope ? t('box-office.codes.words.for', { scope }) : null,
    c.maxUses !== null ? t('box-office.codes.words.uses-of', { used: c.used, max: c.maxUses }) : t('box-office.codes.words.uses', { count: c.used }),
    c.maxPerOrder !== null ? t('box-office.codes.words.per-order', { count: c.maxPerOrder }) : null,
    c.validUntil !== null ? t('box-office.codes.words.until', { when: dateTime(c.validUntil) }) : null,
    c.note,
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

interface Form { code: string, effect: Effect, percent: number | null, amount: number | null, productionId: string, performanceId: string, bandId: string, ticketTypeId: string, maxUses: number | null, maxPerOrder: number | null, validFrom: number | null, validUntil: number | null, note: string }
const blank = (): Form => ({ code: '', effect: 'percent_off', percent: 10, amount: null, productionId: ANY, performanceId: ANY, bandId: ANY, ticketTypeId: ANY, maxUses: null, maxPerOrder: null, validFrom: null, validUntil: null, note: '' }) // not-policy: a new code's first guess, ten per cent off
const form = ref<Form>(blank())
const editing = ref(false)
const editId = ref<string | null>(null)
const formRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
// Another production's performance or section cannot stay picked.
watch(() => form.value.productionId, () => {
  if (!picked.value?.performances.some(p => p.id === form.value.performanceId)) form.value.performanceId = ANY
  if (!picked.value?.bands.some(b => b.id === form.value.bandId)) form.value.bandId = ANY
})
const asForm = (c: PromoCode): Form => ({
  code: c.code, effect: c.effect, percent: c.effect === 'percent_off' ? c.value / 100 : null, amount: c.effect === 'percent_off' ? null : c.value,
  productionId: c.productionId ?? ANY, performanceId: c.performanceId ?? ANY, bandId: c.bandId ?? ANY, ticketTypeId: c.ticketTypeId ?? ANY, maxUses: c.maxUses, maxPerOrder: c.maxPerOrder, validFrom: c.validFrom, validUntil: c.validUntil, note: c.note ?? '',
})
const asBody = (f: Form) => ({
  code: f.code.trim(), effect: f.effect, value: f.effect === 'percent_off' ? Math.round((f.percent ?? 0) * 100) : (f.amount ?? 0),
  productionId: f.productionId === ANY ? null : f.productionId,
  performanceId: f.productionId === ANY || f.performanceId === ANY ? null : f.performanceId,
  bandId: f.productionId === ANY || f.bandId === ANY ? null : f.bandId,
  ticketTypeId: f.ticketTypeId === ANY ? null : f.ticketTypeId,
  maxUses: f.maxUses ?? null, maxPerOrder: f.maxPerOrder ?? null, validFrom: f.validFrom, validUntil: f.validUntil, note: f.note.trim() || null,
})
function open(c?: PromoCode) {
  editId.value = c?.id ?? null
  form.value = c ? asForm(c) : blank()
  formRefusal.value = null
  editing.value = true
}
const url = (id: string) => `/api/box-office/promo-codes/${encodeURIComponent(id)}`
// A code is kept without spaces and in capitals (the server's normaliseCode), so the form shows
// what will be saved, checks the characters beside the field, and the toast names the stored code.
const stored = (typed: string) => typed.replace(/\s+/g, '').toUpperCase()
const storedAs = computed(() => {
  const code = stored(form.value.code)
  return code && code !== form.value.code.trim() ? t('box-office.codes.field.code-stored', { code }) : undefined
})
function validate(f: Form) {
  if (!f.code.trim()) return needs({ code: '' })
  if (!/^[A-Za-z0-9 _-]+$/.test(f.code)) return [{ name: 'code', message: t('box-office.codes.field.code-invalid') }]
  if (stored(f.code).length < 3) return [{ name: 'code', message: t('box-office.codes.field.code-short') }] // not-policy: the server's shortest code
  return []
}

async function save() {
  const body = asBody(form.value)
  const id = editId.value
  const before = id ? data.value?.rows.find(c => c.id === id) : undefined
  const ok = id && before
    ? await run(() => $api(url(id), { method: 'PUT', body }), t('box-office.codes.saved', { code: stored(body.code) }), () => $api(url(id), { method: 'PUT', body: asBody(asForm(before)) }), formRefusal)
    : await run(() => $api<{ id: string }>('/api/box-office/promo-codes', { method: 'POST', body }), t('box-office.codes.added', { code: stored(body.code) }), made => $api(`${url(made.id)}/active`, { method: 'POST', body: { active: false } }), formRefusal)
  if (ok) editing.value = false
}
const setActive = (c: PromoCode, on: boolean) => run(() => $api(`${url(c.id)}/active`, { method: 'POST', body: { active: on } }), t(on ? 'box-office.codes.restored' : 'box-office.codes.retired', { code: c.code }), () => $api(`${url(c.id)}/active`, { method: 'POST', body: { active: !on } }))
const actions = (c: PromoCode) => [[
  { label: t('box-office.codes.edit'), icon: 'i-lucide-pencil', onSelect: () => open(c) },
  c.active
    ? { label: t('box-office.codes.retire'), icon: 'i-lucide-archive', onSelect: () => setActive(c, false) }
    : { label: t('box-office.codes.restore'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(c, true) },
]]
</script>

<template>
  <PageFrame
    :title="t('box-office.navigation.codes.label')"
    :description="t('box-office.codes.description')"
    width="reading"
  >
    <template #primary>
      <UButton
        :label="t('box-office.codes.new')"
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
          :title="t('box-office.codes.empty.title')"
          :description="t('box-office.codes.empty.description')"
          icon="i-lucide-percent"
        />
        <RecordList
          v-if="active.length"
          :label="t('box-office.navigation.codes.label')"
        >
          <RecordListItem
            v-for="c in active"
            :key="c.id"
            :name="c.code"
            :description="describe(c)"
          >
            <RowActions
              :items="actions(c)"
              :label="t('box-office.codes.actions', { code: c.code })"
            />
          </RecordListItem>
        </RecordList>
        <CollapsibleDivider
          v-model:open="retiredOpen"
          :label="t('box-office.codes.retired-heading')"
          :count="retired.length"
        >
          <RecordList :label="t('box-office.codes.retired-heading')">
            <RecordListItem
              v-for="c in retired"
              :key="c.id"
              :name="c.code"
              :description="describe(c)"
              muted
            >
              <RowActions
                :items="actions(c)"
                :label="t('box-office.codes.actions', { code: c.code })"
              />
            </RecordListItem>
          </RecordList>
        </CollapsibleDivider>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="editing"
      :title="editId ? t('box-office.codes.edit-title') : t('box-office.codes.new')"
    >
      <template #body>
        <UForm
          id="promo-code-form"
          :state="form"
          :validate="validate"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="formRefusal" />
          <UFormField
            :label="t('box-office.codes.field.code')"
            :help="storedAs ?? t('box-office.codes.field.code-help')"
            name="code"
            required
          >
            <UInput
              v-model="form.code"
              maxlength="32"
              autocomplete="off"
              class="w-48 uppercase"
            />
          </UFormField>
          <UFormField
            :label="t('box-office.codes.field.effect')"
            name="effect"
          >
            <USelect
              v-model="form.effect"
              :items="effects"
              class="w-56"
            />
          </UFormField>
          <UFormField
            v-if="form.effect === 'percent_off'"
            :label="t('box-office.codes.field.percent')"
            name="value"
            required
          >
            <UInputNumber
              v-model="form.percent"
              :min="1"
              :max="100"
              :format-options="{ maximumFractionDigits: 2 }"
              class="w-32"
            />
          </UFormField>
          <UFormField
            v-else
            :label="t(form.effect === 'amount_off' ? 'box-office.codes.field.amount' : 'box-office.codes.field.price')"
            name="value"
            required
          >
            <FieldMoney
              v-model="form.amount"
              :steppers="false"
              class="w-32"
            />
          </UFormField>
          <UFormField
            :label="t('box-office.codes.field.production')"
            name="productionId"
          >
            <USelectMenu
              v-model="form.productionId"
              :items="productionItems"
              value-key="value"
              class="w-72"
            />
          </UFormField>
          <template v-if="picked">
            <UFormField
              :label="t('box-office.codes.field.performance')"
              name="performanceId"
            >
              <USelectMenu
                v-model="form.performanceId"
                :items="performanceItems"
                value-key="value"
                class="w-72"
              />
            </UFormField>
            <UFormField
              v-if="picked.bands.length > 1"
              :label="t('box-office.codes.field.band')"
              name="bandId"
            >
              <USelect
                v-model="form.bandId"
                :items="bandItems"
                class="w-56"
              />
            </UFormField>
          </template>
          <UFormField
            :label="t('box-office.codes.field.type')"
            name="ticketTypeId"
          >
            <USelect
              v-model="form.ticketTypeId"
              :items="typeItems"
              class="w-56"
            />
          </UFormField>
          <div class="flex flex-wrap gap-4">
            <UFormField
              :label="t('box-office.codes.field.max-uses')"
              :help="t('box-office.codes.field.max-uses-help')"
              name="maxUses"
            >
              <UInputNumber
                :model-value="form.maxUses ?? undefined"
                :min="1"
                class="w-32"
                @update:model-value="form.maxUses = $event ?? null"
              />
            </UFormField>
            <UFormField
              :label="t('box-office.codes.field.per-order')"
              :help="t('box-office.codes.field.per-order-help')"
              name="maxPerOrder"
            >
              <UInputNumber
                :model-value="form.maxPerOrder ?? undefined"
                :min="1"
                class="w-32"
                @update:model-value="form.maxPerOrder = $event ?? null"
              />
            </UFormField>
          </div>
          <UFormField
            :label="t('box-office.codes.field.from')"
            name="validFrom"
          >
            <FieldDateTime v-model="form.validFrom" />
          </UFormField>
          <UFormField
            :label="t('box-office.codes.field.until')"
            name="validUntil"
          >
            <FieldDateTime v-model="form.validUntil" />
          </UFormField>
          <UFormField
            :label="t('box-office.codes.field.note')"
            :help="t('box-office.codes.field.note-help')"
            name="note"
          >
            <UInput
              v-model="form.note"
              maxlength="200"
              class="w-80"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="promo-code-form"
          :label="t('box-office.codes.save')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
