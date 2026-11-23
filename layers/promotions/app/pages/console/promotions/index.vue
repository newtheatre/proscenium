<!-- Promotions (the unified promotions design): every reduction from a price, whatever is sold, in
     one list. A promotion starts on its own or from a code, takes something off the items it
     applies to, and is limited by uses, dates and where it is sold. Each is made and changed on a
     page of its own. Retired promotions fold away. -->
<script setup lang="ts">
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

/** A window of the week a promotion runs in: ISO weekdays (1 is Monday) and times as HH:MM. */
interface Window { days: number[], from: string, until: string }
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
// The codes and the count of uses are drawn apart from this line: codes as badges, uses where the row ends.
function describe(p: Promotion) {
  const on = p.targets.filter(x => x.role === 'applies').map(x => x.words ?? t(kindOf(x.kind)?.label ?? x.kind)).join('; ')
  return [
    effectWords(p),
    on ? t('promotions.words.on', { what: on }) : null,
    p.trigger === 'code' ? null : t(`promotions.words.${p.trigger}`),
    p.needsReason ? t('promotions.words.needs-reason') : null,
    p.channel !== 'all' ? t(`promotions.channel.${p.channel}`) : null,
    p.maxPerSale !== null ? t('promotions.words.per-sale', { count: p.maxPerSale }) : null,
    p.validUntil !== null ? t('promotions.words.until', { when: dateTime(p.validUntil) }) : null,
    p.note,
  ].filter(Boolean).join(' · ')
}
const usesOf = (p: Promotion) => (p.maxUses !== null ? t('promotions.words.uses-of', { used: p.used, max: p.maxUses }) : t('promotions.words.uses', { count: p.used }))
const codesOf = (p: Promotion) => (p.trigger === 'code' ? p.codes.filter(c => c.active) : [])

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function run<T>(fn: () => Promise<T>, done: string, undo?: (result: T) => Promise<unknown>) {
  refusal.value = null
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
    refusal.value = toRefusal(e)
    return false
  }
}

const url = (id: string) => `/api/promotions/${encodeURIComponent(id)}`
const setActive = (p: Promotion, on: boolean) => run(() => $api(`${url(p.id)}/active`, { method: 'POST', body: { active: on } }), t(on ? 'promotions.restored' : 'promotions.retired', { name: p.name }), () => $api(`${url(p.id)}/active`, { method: 'POST', body: { active: !on } }))
const actions = (p: Promotion) => [[
  { label: t('promotions.edit'), icon: 'i-lucide-pencil', to: `/console/promotions/${p.id}` },
  p.active
    ? { label: t('promotions.retire'), icon: 'i-lucide-archive', onSelect: () => setActive(p, false) }
    : { label: t('promotions.restore'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(p, true) },
]]
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
        to="/console/promotions/new"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="space-y-4">
        <RefusalNotice :refusal="refusal" />
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
            <template
              v-if="codesOf(p).length"
              #below
            >
              <ul
                class="flex flex-wrap gap-1.5"
                :aria-label="t('promotions.field.codes')"
              >
                <li
                  v-for="c in codesOf(p)"
                  :key="c.id"
                >
                  <UBadge
                    :label="c.maxUses !== null ? t('promotions.words.code-uses', { code: c.code, used: c.used, max: c.maxUses }) : c.code"
                    color="neutral"
                    variant="subtle"
                    class="font-mono"
                  />
                </li>
              </ul>
            </template>
            <span class="text-sm text-muted tabular-nums">{{ usesOf(p) }}</span>
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
              <template
                v-if="codesOf(p).length"
                #below
              >
                <ul
                  class="flex flex-wrap gap-1.5"
                  :aria-label="t('promotions.field.codes')"
                >
                  <li
                    v-for="c in codesOf(p)"
                    :key="c.id"
                  >
                    <UBadge
                      :label="c.maxUses !== null ? t('promotions.words.code-uses', { code: c.code, used: c.used, max: c.maxUses }) : c.code"
                      color="neutral"
                      variant="subtle"
                      class="font-mono"
                    />
                  </li>
                </ul>
              </template>
              <span class="text-sm text-muted tabular-nums">{{ usesOf(p) }}</span>
              <RowActions
                :items="actions(p)"
                :label="t('promotions.actions', { name: p.name })"
              />
            </RecordListItem>
          </RecordList>
        </CollapsibleDivider>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
