<!-- Promotions (the unified promotions design): every reduction from a price, whatever is sold, in
     one list. A promotion starts on its own or from a code, takes something off the items it
     applies to, and is limited by uses, dates and where it is sold. What it can apply to comes from
     the selling modules switched on, each with its own pickers. Retired promotions fold away. -->
<script setup lang="ts">
import { parseTime } from '@internationalized/date'

type Effect = 'percent_off' | 'amount_off' | 'set_price' | 'multi_buy' | 'basket_amount_off'
type Trigger = 'automatic' | 'code' | 'staff'
type Channel = 'all' | 'online' | 'till'
type Scope = Record<string, string>
interface Field { id: string, label: string, options: { value: string, label: string, parent?: string }[], parent?: string, needsParent?: boolean }
interface Kind { kind: string, label: string, fields: Field[] }
interface Code { id: string, code: string, maxUses: number | null, used: number, active: boolean, note: string | null }
interface Target { role: 'applies' | 'requires', kind: string, scope: Scope, quantity: number, words: string | null }
interface Promotion {
  id: string
  name: string
  label: string
  trigger: Trigger
  effect: Effect
  value: number
  buyQuantity: number | null
  freeQuantity: number | null
  channel: Channel
  validFrom: number | null
  validUntil: number | null
  schedule: Window[] | null
  minSpendMinor: number | null
  maxUses: number | null
  used: number
  countBy: 'item' | 'sale'
  maxPerSale: number | null
  combines: boolean
  notWithRequirements: boolean
  needsReason: boolean
  active: boolean
  note: string | null
  codes: Code[]
  targets: Target[]
}
interface Listing { rows: Promotion[], kinds: Kind[] }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { offer } = useUndo()
const { money } = await useMoney()
const { dateTime } = useDates()
const { data, status, error, refresh } = await useAPI<Listing>('/api/promotions', { key: 'promotions:list' })

const ANY = '__any'
/** A window of the week a promotion runs in: ISO weekdays (1 is Monday) and times as HH:MM. */
interface Window { days: number[], from: string, until: string }
/** A window as the form holds it: the checkbox group's days are strings. */
interface FormWindow { days: string[], from: string, until: string }
const WEEK = ['1', '2', '3', '4', '5', '6', '7'] // not-policy: the days of the week
const EFFECTS: Effect[] = ['percent_off', 'amount_off', 'set_price', 'multi_buy', 'basket_amount_off']
const effectItems = computed(() => EFFECTS.map(value => ({ value, label: t(`promotions.effect.${value}`) })))
const triggerItems = computed(() => (['code', 'automatic', 'staff'] as const).map(value => ({ value, label: t(`promotions.trigger.${value}`) })))
const channelItems = computed(() => (['all', 'online', 'till'] as const).map(value => ({ value, label: t(`promotions.channel.${value}`) })))
const kindItems = computed(() => (data.value?.kinds ?? []).map(k => ({ value: k.kind, label: t(k.label) })))
const kindOf = (kind: string) => data.value?.kinds.find(k => k.kind === kind)
const active = computed(() => (data.value?.rows ?? []).filter(p => p.active))
const retired = computed(() => (data.value?.rows ?? []).filter(p => !p.active))
const retiredOpen = ref(false)

function effectWords(p: Pick<Promotion, 'effect' | 'value' | 'buyQuantity' | 'freeQuantity' | 'minSpendMinor'>) {
  switch (p.effect) {
    case 'percent_off': return t('promotions.words.percent_off', { percent: p.value / 100 })
    case 'multi_buy': return p.freeQuantity
      ? t('promotions.words.multi_buy_free', { buy: p.buyQuantity ?? 0, pay: (p.buyQuantity ?? 0) - p.freeQuantity })
      : t('promotions.words.multi_buy_price', { buy: p.buyQuantity ?? 0, amount: money(p.value) })
    case 'basket_amount_off': return p.minSpendMinor
      ? t('promotions.words.basket_over', { amount: money(p.value), spend: money(p.minSpendMinor) })
      : t('promotions.words.basket_amount_off', { amount: money(p.value) })
    default: return t(`promotions.words.${p.effect}`, { amount: money(p.value) })
  }
}
function describe(p: Promotion) {
  const on = p.targets.filter(x => x.role === 'applies').map(x => x.words ?? t(kindOf(x.kind)?.label ?? x.kind)).join('; ')
  const codes = p.codes.filter(c => c.active).map(c => c.code).join(', ')
  return [
    effectWords(p),
    on ? t('promotions.words.on', { what: on }) : null,
    p.trigger === 'code' ? (codes ? t('promotions.words.codes', { codes }) : null) : t(`promotions.words.${p.trigger}`),
    p.needsReason ? t('promotions.words.needs-reason') : null,
    p.channel !== 'all' ? t(`promotions.channel.${p.channel}`) : null,
    p.maxUses !== null ? t('promotions.words.uses-of', { used: p.used, max: p.maxUses }) : t('promotions.words.uses', { count: p.used }),
    p.maxPerSale !== null ? t('promotions.words.per-sale', { count: p.maxPerSale }) : null,
    p.validUntil !== null ? t('promotions.words.until', { when: dateTime(p.validUntil) }) : null,
    p.note,
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

// ---- The form ----

interface FormCode { id?: string, code: string, maxUses: number | null }
interface FormTarget { kind: string, scope: Scope }
interface Form {
  name: string
  label: string
  trigger: Trigger
  codes: FormCode[]
  effect: Effect
  percent: number | null
  amount: number | null
  multiBuy: 'free' | 'price'
  buyQuantity: number | null
  freeQuantity: number | null
  minSpend: number | null
  targets: FormTarget[]
  channel: Channel
  maxUses: number | null
  maxPerSale: number | null
  countBy: 'item' | 'sale'
  combines: boolean
  notWithRequirements: boolean
  needsReason: boolean
  validFrom: number | null
  validUntil: number | null
  schedule: FormWindow[]
  note: string
}
const firstKind = () => data.value?.kinds[0]?.kind ?? ''
const blank = (): Form => ({
  name: '', label: '', trigger: 'code', codes: [{ code: '', maxUses: null }], effect: 'percent_off', percent: 10, amount: null, // not-policy: a new promotion's first guess, ten per cent off
  multiBuy: 'free', buyQuantity: 2, freeQuantity: 1, minSpend: null, targets: [{ kind: firstKind(), scope: {} }], channel: 'all', // not-policy: a new multi-buy's first guess, two for one
  maxUses: null, maxPerSale: null, countBy: 'item', combines: false, notWithRequirements: true, needsReason: false, validFrom: null, validUntil: null, schedule: [], note: '',
})
const form = ref<Form>(blank())
const editing = ref(false)
const editId = ref<string | null>(null)
const more = ref(false)
const formRefusal = ref<ReturnType<typeof toRefusal> | null>(null)

const asForm = (p: Promotion): Form => ({
  name: p.name, label: p.label, trigger: p.trigger,
  codes: p.codes.filter(c => c.active).map(c => ({ id: c.id, code: c.code, maxUses: c.maxUses })),
  effect: p.effect, percent: p.effect === 'percent_off' ? p.value / 100 : null, amount: p.effect === 'percent_off' || (p.effect === 'multi_buy' && p.freeQuantity) ? null : p.value,
  multiBuy: p.freeQuantity ? 'free' : 'price', buyQuantity: p.buyQuantity, freeQuantity: p.freeQuantity, minSpend: p.minSpendMinor,
  targets: p.targets.filter(x => x.role === 'applies').map(x => ({ kind: x.kind, scope: { ...x.scope } })), channel: p.channel,
  maxUses: p.maxUses, maxPerSale: p.maxPerSale, countBy: p.countBy, combines: p.combines, notWithRequirements: p.notWithRequirements, needsReason: p.needsReason, validFrom: p.validFrom, validUntil: p.validUntil, schedule: (p.schedule ?? []).map(w => ({ from: w.from, until: w.until, days: w.days.map(String) })), note: p.note ?? '',
})
function valueOf(f: Form) {
  if (f.effect === 'percent_off') return Math.round((f.percent ?? 0) * 100)
  if (f.effect === 'multi_buy' && f.multiBuy === 'free') return 0
  return f.amount ?? 0
}
const asBody = (f: Form) => ({
  name: f.name.trim(), label: f.label.trim() || f.name.trim(), trigger: f.trigger, effect: f.effect, value: valueOf(f),
  buyQuantity: f.effect === 'multi_buy' ? f.buyQuantity : null,
  freeQuantity: f.effect === 'multi_buy' && f.multiBuy === 'free' ? f.freeQuantity : null,
  minSpendMinor: f.effect === 'basket_amount_off' ? f.minSpend : null,
  codes: f.trigger === 'code' ? f.codes.filter(c => c.code.trim()).map(c => ({ ...(c.id ? { id: c.id } : {}), code: c.code.trim(), maxUses: c.maxUses })) : [],
  targets: f.targets.map(x => ({ role: 'applies' as const, kind: x.kind, scope: Object.fromEntries(Object.entries(x.scope).filter(([, v]) => v && v !== ANY)) })),
  channel: f.trigger === 'staff' ? 'till' : f.channel, maxUses: f.maxUses, maxPerSale: f.effect === 'basket_amount_off' ? null : f.maxPerSale, countBy: f.countBy,
  combines: f.combines, notWithRequirements: f.notWithRequirements, needsReason: f.trigger === 'staff' && f.needsReason, validFrom: f.validFrom, validUntil: f.validUntil, schedule: f.schedule.length ? f.schedule.map(w => ({ days: w.days.map(Number).sort((a, b) => a - b), from: w.from, until: w.until })) : null, note: f.note.trim() || null,
})
function open(p?: Promotion) {
  editId.value = p?.id ?? null
  form.value = p ? asForm(p) : blank()
  more.value = !!p && (p.maxUses !== null || p.maxPerSale !== null || p.validFrom !== null || p.validUntil !== null || !!p.schedule || p.channel !== 'all' || p.combines || !!p.note)
  formRefusal.value = null
  editing.value = true
}

// A kind's pickers: a child (a show's performances) shows once its parent is picked, offers only
// the parent's options, and is cleared when the parent changes.
function shownFields(x: FormTarget) {
  return (kindOf(x.kind)?.fields ?? []).filter(f => !f.needsParent || (f.parent && x.scope[f.parent] && x.scope[f.parent] !== ANY))
}
function optionsOf(x: FormTarget, f: Field) {
  const parent = f.parent ? x.scope[f.parent] : undefined
  const within = parent && parent !== ANY ? f.options.filter(o => !o.parent || o.parent === parent) : f.options
  return [{ value: ANY, label: t('promotions.field.any', { what: t(f.label).toLowerCase() }) }, ...within]
}
function pick(x: FormTarget, f: Field, value: string) {
  const gone = new Set((kindOf(x.kind)?.fields ?? [])
    .filter(child => child.parent === f.id && (value === ANY || !child.options.some(o => o.value === x.scope[child.id] && (!o.parent || o.parent === value))))
    .map(child => child.id))
  x.scope = Object.fromEntries([...Object.entries(x.scope).filter(([id]) => !gone.has(id)), [f.id, value]])
}
function setKind(x: FormTarget, kind: string) {
  x.kind = kind
  x.scope = {}
}
const addTarget = () => form.value.targets.push({ kind: firstKind(), scope: {} })
const addCode = () => form.value.codes.push({ code: '', maxUses: null })
// A new window starts as the evenings of the working week, the usual happy hour.
const addWindow = () => form.value.schedule.push({ days: ['1', '2', '3', '4', '5'], from: '17:00', until: '19:00' }) // not-policy: a first guess the form shows
const dayItems = computed(() => WEEK.map(d => ({ value: d, label: t(`promotions.day.${d}`) })))
function timeOf(value: string) {
  try {
    return value ? parseTime(value) : undefined
  }
  catch {
    return undefined
  }
}
const asTime = (value: unknown) => value ? String(value).slice(0, 5) : '' // not-policy: HH:mm

const url = (id: string) => `/api/promotions/${encodeURIComponent(id)}`
const stored = (typed: string) => typed.replace(/\s+/g, '').toUpperCase()
function validate(f: Form) {
  const errors = needs({ name: f.name.trim() })
  if (f.trigger === 'code') {
    const typed = f.codes.filter(c => c.code.trim())
    if (!typed.length) errors.push({ name: 'codes', message: t('promotions.field.codes-needed') })
    for (const c of typed) {
      if (!/^[A-Za-z0-9 _-]+$/.test(c.code)) errors.push({ name: 'codes', message: t('promotions.field.code-invalid') })
      else if (stored(c.code).length < 3) errors.push({ name: 'codes', message: t('promotions.field.code-short') }) // not-policy: the server's shortest code
    }
  }
  if (f.effect === 'percent_off' && !f.percent) errors.push({ name: 'value', message: t('promotions.field.value-needed') })
  if (['amount_off', 'set_price', 'basket_amount_off'].includes(f.effect) && f.amount === null) errors.push({ name: 'value', message: t('promotions.field.value-needed') })
  if (f.effect === 'multi_buy') {
    if (!f.buyQuantity || f.buyQuantity < 2) errors.push({ name: 'buyQuantity', message: t('promotions.field.buy-needed') })
    if (f.multiBuy === 'free' && (!f.freeQuantity || (f.buyQuantity && f.freeQuantity >= f.buyQuantity))) errors.push({ name: 'freeQuantity', message: t('promotions.field.free-fewer') })
    if (f.multiBuy === 'price' && !f.amount) errors.push({ name: 'value', message: t('promotions.field.value-needed') })
  }
  if (!f.targets.length) errors.push({ name: 'targets', message: t('promotions.field.targets-needed') })
  if (f.validFrom && f.validUntil && f.validUntil <= f.validFrom) errors.push({ name: 'validUntil', message: t('promotions.field.until-after') })
  f.schedule.forEach((w, i) => {
    if (!w.days.length) errors.push({ name: `schedule.${i}.days`, message: t('promotions.field.schedule-days-needed') })
    if (!w.from || !w.until) errors.push({ name: `schedule.${i}.times`, message: t('promotions.field.schedule-times-needed') })
  })
  return errors
}

async function save() {
  const body = asBody(form.value)
  const id = editId.value
  const before = id ? data.value?.rows.find(p => p.id === id) : undefined
  const ok = id && before
    ? await run(() => $api(url(id), { method: 'PUT', body }), t('promotions.saved', { name: body.name }), () => $api(url(id), { method: 'PUT', body: asBody(asForm(before)) }), formRefusal)
    : await run(() => $api<{ id: string }>('/api/promotions', { method: 'POST', body }), t('promotions.added', { name: body.name }), made => $api(`${url(made.id)}/active`, { method: 'POST', body: { active: false } }), formRefusal)
  if (ok) editing.value = false
}
const setActive = (p: Promotion, on: boolean) => run(() => $api(`${url(p.id)}/active`, { method: 'POST', body: { active: on } }), t(on ? 'promotions.restored' : 'promotions.retired', { name: p.name }), () => $api(`${url(p.id)}/active`, { method: 'POST', body: { active: !on } }))
const actions = (p: Promotion) => [[
  { label: t('promotions.edit'), icon: 'i-lucide-pencil', onSelect: () => open(p) },
  p.active
    ? { label: t('promotions.retire'), icon: 'i-lucide-archive', onSelect: () => setActive(p, false) }
    : { label: t('promotions.restore'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(p, true) },
]]
const perItem = computed(() => !['basket_amount_off'].includes(form.value.effect))
</script>

<template>
  <PageFrame
    :title="t('promotions.navigation.promotions.label')"
    :description="t('promotions.description')"
    width="reading"
  >
    <template #primary>
      <UButton
        :label="t('promotions.new')"
        icon="i-lucide-plus"
        :disabled="!data?.kinds.length"
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
          :title="t('promotions.empty.title')"
          :description="t(data?.kinds.length ? 'promotions.empty.description' : 'promotions.empty.no-kinds')"
          icon="i-lucide-percent"
        />
        <RecordList
          v-if="active.length"
          :label="t('promotions.navigation.promotions.label')"
        >
          <RecordListItem
            v-for="p in active"
            :key="p.id"
            :name="p.name"
            :description="describe(p)"
          >
            <RowActions
              :items="actions(p)"
              :label="t('promotions.actions', { name: p.name })"
            />
          </RecordListItem>
        </RecordList>
        <CollapsibleDivider
          v-model:open="retiredOpen"
          :label="t('promotions.retired-heading')"
          :count="retired.length"
        >
          <RecordList :label="t('promotions.retired-heading')">
            <RecordListItem
              v-for="p in retired"
              :key="p.id"
              :name="p.name"
              :description="describe(p)"
              muted
            >
              <RowActions
                :items="actions(p)"
                :label="t('promotions.actions', { name: p.name })"
              />
            </RecordListItem>
          </RecordList>
        </CollapsibleDivider>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="editing"
      :title="editId ? t('promotions.edit-title') : t('promotions.new')"
    >
      <template #body>
        <UForm
          id="promotion-form"
          :state="form"
          :validate="validate"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="formRefusal" />
          <UFormField
            :label="t('promotions.field.name')"
            :help="t('promotions.field.name-help')"
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
            :label="t('promotions.field.label')"
            :help="t('promotions.field.label-help')"
            name="label"
          >
            <UInput
              v-model="form.label"
              :placeholder="form.name"
              maxlength="60"
              class="w-80"
            />
          </UFormField>

          <UFormField
            :label="t('promotions.field.trigger')"
            name="trigger"
          >
            <USelect
              v-model="form.trigger"
              :items="triggerItems"
              class="w-64"
            />
          </UFormField>
          <UFormField
            v-if="form.trigger === 'staff'"
            name="needsReason"
          >
            <UCheckbox
              v-model="form.needsReason"
              :label="t('promotions.field.needs-reason')"
              :description="t('promotions.field.needs-reason-help')"
            />
          </UFormField>
          <UFormField
            v-if="form.trigger === 'code'"
            :label="t('promotions.field.codes')"
            :help="t('promotions.field.code-help')"
            name="codes"
            required
          >
            <div class="space-y-2">
              <div
                v-for="(c, i) in form.codes"
                :key="c.id ?? i"
                class="flex flex-wrap items-center gap-2"
              >
                <UInput
                  v-model="c.code"
                  maxlength="32"
                  autocomplete="off"
                  class="w-48 uppercase"
                  :aria-label="t('promotions.field.code')"
                />
                <UInputNumber
                  :model-value="c.maxUses ?? undefined"
                  :min="1"
                  :placeholder="t('promotions.field.code-uses')"
                  class="w-36"
                  :aria-label="t('promotions.field.code-uses')"
                  @update:model-value="c.maxUses = $event ?? null"
                />
                <IconButton
                  v-if="form.codes.length > 1"
                  icon="i-lucide-x"
                  :label="t('promotions.field.remove-code', { code: c.code || '…' })"
                  @click="form.codes.splice(i, 1)"
                />
              </div>
              <UButton
                :label="t('promotions.field.add-code')"
                icon="i-lucide-plus"
                color="neutral"
                variant="link"
                class="px-0"
                @click="addCode"
              />
            </div>
          </UFormField>

          <UFormField
            :label="t('promotions.field.effect')"
            name="effect"
          >
            <USelect
              v-model="form.effect"
              :items="effectItems"
              class="w-72"
            />
          </UFormField>
          <UFormField
            v-if="form.effect === 'percent_off'"
            :label="t('promotions.field.percent')"
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
          <template v-else-if="form.effect === 'multi_buy'">
            <div class="flex flex-wrap gap-4">
              <UFormField
                :label="t('promotions.field.buy')"
                :help="t('promotions.field.buy-help')"
                name="buyQuantity"
                required
              >
                <UInputNumber
                  :model-value="form.buyQuantity ?? undefined"
                  :min="2"
                  :max="50"
                  class="w-32"
                  @update:model-value="form.buyQuantity = $event ?? null"
                />
              </UFormField>
              <UFormField
                :label="t('promotions.field.multi-buy')"
                name="multiBuy"
              >
                <USelect
                  v-model="form.multiBuy"
                  :items="[{ value: 'free', label: t('promotions.field.multi-buy-free') }, { value: 'price', label: t('promotions.field.multi-buy-price') }]"
                  class="w-56"
                />
              </UFormField>
            </div>
            <UFormField
              v-if="form.multiBuy === 'free'"
              :label="t('promotions.field.free')"
              :help="t('promotions.field.free-help')"
              name="freeQuantity"
              required
            >
              <UInputNumber
                :model-value="form.freeQuantity ?? undefined"
                :min="1"
                :max="49"
                class="w-32"
                @update:model-value="form.freeQuantity = $event ?? null"
              />
            </UFormField>
            <UFormField
              v-else
              :label="t('promotions.field.group-price')"
              name="value"
              required
            >
              <FieldMoney
                v-model="form.amount"
                :steppers="false"
                class="w-32"
              />
            </UFormField>
          </template>
          <template v-else>
            <UFormField
              :label="t(`promotions.field.amount.${form.effect}`)"
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
              v-if="form.effect === 'basket_amount_off'"
              :label="t('promotions.field.min-spend')"
              :help="t('promotions.field.min-spend-help')"
              name="minSpendMinor"
            >
              <FieldMoney
                v-model="form.minSpend"
                :steppers="false"
                class="w-32"
              />
            </UFormField>
          </template>

          <UFormField
            :label="t(form.effect === 'basket_amount_off' ? 'promotions.field.targets-basket' : 'promotions.field.targets')"
            name="targets"
            required
          >
            <div class="space-y-3">
              <div
                v-for="(x, i) in form.targets"
                :key="i"
                class="space-y-2 rounded-md border border-default p-3"
              >
                <div class="flex items-center gap-2">
                  <USelect
                    :model-value="x.kind"
                    :items="kindItems"
                    class="w-56"
                    :aria-label="t('promotions.field.kind')"
                    @update:model-value="setKind(x, $event as string)"
                  />
                  <IconButton
                    v-if="form.targets.length > 1"
                    icon="i-lucide-x"
                    class="ms-auto"
                    :label="t('promotions.field.remove-target')"
                    @click="form.targets.splice(i, 1)"
                  />
                </div>
                <UFormField
                  v-for="f in shownFields(x)"
                  :key="f.id"
                  :label="t(f.label)"
                  :name="`targets.${i}.${f.id}`"
                >
                  <USelectMenu
                    :model-value="x.scope[f.id] ?? ANY"
                    :items="optionsOf(x, f)"
                    value-key="value"
                    :search-input="optionsOf(x, f).length > 10 ? undefined : false"
                    class="w-72"
                    @update:model-value="pick(x, f, $event as string)"
                  />
                </UFormField>
              </div>
              <UButton
                :label="t('promotions.field.add-target')"
                icon="i-lucide-plus"
                color="neutral"
                variant="link"
                class="px-0"
                @click="addTarget"
              />
            </div>
          </UFormField>

          <UFormField
            v-if="perItem"
            name="notWithRequirements"
          >
            <UCheckbox
              v-model="form.notWithRequirements"
              :label="t('promotions.field.not-with-requirements')"
              :description="t('promotions.field.not-with-requirements-help')"
            />
          </UFormField>

          <UButton
            :label="t(more ? 'promotions.field.fewer' : 'promotions.field.more')"
            :icon="more ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            color="neutral"
            variant="link"
            class="px-0"
            @click="more = !more"
          />
          <template v-if="more">
            <UFormField
              v-if="form.trigger !== 'staff'"
              :label="t('promotions.field.channel')"
              name="channel"
            >
              <USelect
                v-model="form.channel"
                :items="channelItems"
                class="w-56"
              />
            </UFormField>
            <div class="flex flex-wrap gap-4">
              <UFormField
                :label="t('promotions.field.max-uses')"
                :help="t(`promotions.field.max-uses-help.${form.countBy}`)"
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
                v-if="perItem"
                :label="t('promotions.field.per-sale')"
                :help="t('promotions.field.per-sale-help')"
                name="maxPerSale"
              >
                <UInputNumber
                  :model-value="form.maxPerSale ?? undefined"
                  :min="1"
                  class="w-32"
                  @update:model-value="form.maxPerSale = $event ?? null"
                />
              </UFormField>
            </div>
            <UFormField
              v-if="perItem"
              :label="t('promotions.field.count-by')"
              name="countBy"
            >
              <USelect
                v-model="form.countBy"
                :items="[{ value: 'item', label: t('promotions.count-by.item') }, { value: 'sale', label: t('promotions.count-by.sale') }]"
                class="w-56"
              />
            </UFormField>
            <UFormField
              v-if="perItem"
              name="combines"
            >
              <UCheckbox
                v-model="form.combines"
                :label="t('promotions.field.combines')"
                :description="t('promotions.field.combines-help')"
              />
            </UFormField>
            <UFormField
              :label="t('promotions.field.from')"
              name="validFrom"
            >
              <FieldDateTime v-model="form.validFrom" />
            </UFormField>
            <UFormField
              :label="t('promotions.field.until')"
              name="validUntil"
            >
              <FieldDateTime v-model="form.validUntil" />
            </UFormField>
            <UFormField
              :label="t('promotions.field.schedule')"
              :help="t('promotions.field.schedule-help')"
              name="schedule"
            >
              <div class="space-y-3">
                <div
                  v-for="(w, i) in form.schedule"
                  :key="i"
                  class="space-y-2 rounded-md border border-default p-3"
                >
                  <UFormField
                    :name="`schedule.${i}.days`"
                    :label="t('promotions.field.schedule-days', { n: i + 1 })"
                  >
                    <UCheckboxGroup
                      v-model="w.days"
                      :items="dayItems"
                      orientation="horizontal"
                    />
                  </UFormField>
                  <div class="flex flex-wrap items-end gap-3">
                    <UFormField
                      :name="`schedule.${i}.times`"
                      :label="t('promotions.field.schedule-from')"
                    >
                      <UInputTime
                        :model-value="timeOf(w.from)"
                        :hour-cycle="24"
                        class="w-24"
                        @update:model-value="w.from = asTime($event)"
                      />
                    </UFormField>
                    <UFormField :label="t('promotions.field.schedule-until')">
                      <UInputTime
                        :model-value="timeOf(w.until)"
                        :hour-cycle="24"
                        class="w-24"
                        @update:model-value="w.until = asTime($event)"
                      />
                    </UFormField>
                    <IconButton
                      icon="i-lucide-x"
                      :label="t('promotions.field.schedule-remove', { n: i + 1 })"
                      @click="form.schedule.splice(i, 1)"
                    />
                  </div>
                </div>
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-clock"
                  :label="t('promotions.field.schedule-add')"
                  @click="addWindow()"
                />
              </div>
            </UFormField>
            <UFormField
              :label="t('promotions.field.note')"
              :help="t('promotions.field.note-help')"
              name="note"
            >
              <UInput
                v-model="form.note"
                maxlength="200"
                class="w-80"
              />
            </UFormField>
          </template>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="promotion-form"
          :label="t('promotions.save')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
