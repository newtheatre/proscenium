<script setup lang="ts">
import { saysMoney, saysQuantity } from '#shared/utils/bar'
import { joinCount, saysCount, splitCount, stocktakeGroups } from '#shared/utils/stocktakes'
import type { StocktakeLine } from '#shared/utils/stocktakes'

// The count itself, shelf by shelf (issue 1321, F-115): each line saves as its field commits, and
// the expected figure waits until the line is counted.
const props = defineProps<{
  stocktakeId: string
  lines: StocktakeLine[]
  open: boolean
}>()

const emit = defineEmits<{
  saved: [line: StocktakeLine]
}>()

// Blank stays blank until typed into: a cleared field is a count of nothing, not zero.
const drafts = ref<Record<string, number | undefined>>({})
const state = ref<Record<string, 'saving' | 'saved' | 'failed'>>({})
const errors = ref<Record<string, string>>({})
const sequence: Record<string, number> = {}
const inFlight = new Set<Promise<unknown>>()
// One request a line at a time: a later edit must land after an earlier one, never race it.
const queue: Record<string, Promise<unknown>> = {}

const dirty = (line: StocktakeLine): boolean => (drafts.value[line.itemId] ?? null) !== line.countedQty

// A fresh read shows the register, except where this screen still holds a figure it has not saved.
watch(() => props.lines, (lines) => {
  for (const line of lines) {
    const local = state.value[line.itemId]
    if (local !== 'saving' && local !== 'failed') drafts.value[line.itemId] = line.countedQty ?? undefined
  }
}, { immediate: true })

const counted = (line: StocktakeLine): boolean => drafts.value[line.itemId] !== undefined
const byContainer = (line: StocktakeLine): line is StocktakeLine & { containerMl: number } =>
  line.unit === 'ML' && Boolean(line.containerMl)

async function save(line: StocktakeLine): Promise<boolean> {
  const itemId = line.itemId
  const seq = (sequence[itemId] ?? 0) + 1
  sequence[itemId] = seq
  state.value[itemId] = 'saving'
  const pending = (queue[itemId] ?? Promise.resolve()).catch(() => undefined).then(() =>
    $fetch<{ lines: StocktakeLine[] }>(`/api/admin/bar/stocktakes/${props.stocktakeId}/counts`, {
      method: 'PUT',
      body: { counts: [{ itemId, counted: drafts.value[itemId] ?? null }] },
    }))
  queue[itemId] = pending
  inFlight.add(pending)
  try {
    const answered = await pending
    // A later edit to the same line owns its state now; this answer is already out of date.
    if (sequence[itemId] !== seq) return true
    const fresh = answered.lines.find(one => one.itemId === itemId)
    if (fresh) emit('saved', fresh)
    state.value[itemId] = 'saved'
    return true
  }
  catch (refused) {
    if (sequence[itemId] === seq) {
      state.value[itemId] = 'failed'
      errors.value[itemId] = refusalText(refused)
    }
    return false
  }
  finally {
    inFlight.delete(pending)
  }
}

// A measured line stays in view under "Only uncounted" until its open container is in too.
const opening = ref<string | null>(null)

// An unchanged figure is not a count: a field re-applies its value on every blur and Enter.
function commit(line: StocktakeLine, value: number | null): void {
  opening.value = null
  if ((drafts.value[line.itemId] ?? null) === value && state.value[line.itemId] !== 'failed') return
  drafts.value[line.itemId] = value ?? undefined
  void save(line)
}

// A worked-out nought is not a typed one, so clearing the only half with a figure goes back to
// blank rather than saving a counted nought (F-115 criterion 2).
function commitHalf(line: StocktakeLine & { containerMl: number }, half: 'full' | 'part', value: number | undefined): void {
  const qty = drafts.value[line.itemId]
  const held = qty === undefined ? { full: 0, part: 0 } : splitCount(qty, line.containerMl)
  const next = { full: held.full || undefined, part: held.part || undefined, [half]: value }
  commit(line, joinCount(next.full, next.part, line.containerMl))
  if (half === 'full') opening.value = line.itemId
}

// Leaving a line's fields ends its hold on the filtered view, changed or not.
function released(event: FocusEvent): void {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) opening.value = null
}

const shown = (line: StocktakeLine & { containerMl: number }, half: 'full' | 'part'): number | undefined => {
  const qty = drafts.value[line.itemId]
  return qty === undefined ? undefined : splitCount(qty, line.containerMl)[half]
}

// Apply reads the register, so everything typed here is on it first (F-115 criterion 3).
async function flush(): Promise<boolean> {
  await Promise.allSettled([...inFlight])
  const unsaved = props.lines.filter(line => dirty(line) || state.value[line.itemId] === 'failed')
  const results = await Promise.all(unsaved.map(save))
  return results.every(Boolean)
}

defineExpose({ flush })

const uncountedOnly = ref(false)

const visibleGroups = computed(() => stocktakeGroups(uncountedOnly.value
  ? props.lines.filter(line => !counted(line) || line.itemId === opening.value)
  : props.lines))

const countedTotal = computed(() => props.lines.filter(counted).length)
const failedTotal = computed(() => props.lines.filter(line => state.value[line.itemId] === 'failed').length)
const savingNow = computed(() => props.lines.some(line => state.value[line.itemId] === 'saving'))

function variance(line: StocktakeLine): number | null {
  const qty = props.open ? drafts.value[line.itemId] : line.countedQty ?? undefined
  return qty === undefined || line.expectedQty === null ? null : qty - line.expectedQty
}

// The cost is the register's, so it is shown only once the figure on screen is the one it holds.
const atCost = (line: StocktakeLine): string =>
  line.varianceCostPence === null || dirty(line) ? '' : saysMoney(line.varianceCostPence)

function countedIn(line: StocktakeLine): string {
  if (byContainer(line)) return `${line.containerMl} ml containers: full ones, then what is left in the open one`
  return line.unit === 'ML' ? 'Millilitres' : 'Whole items'
}

// Walks the stable order rather than the filtered one: typing has already dropped the row just
// counted out of "Only uncounted" by the time Enter runs.
function focusNext(line: StocktakeLine, from: 'full' | 'part' | 'single'): void {
  if (from === 'full') {
    document.querySelector<HTMLInputElement>(`[data-test="counted-part-${line.itemId}"]`)?.focus()
    return
  }
  const start = props.lines.findIndex(one => one.itemId === line.itemId) + 1
  const next = props.lines.slice(start).find(one => !uncountedOnly.value || !counted(one))
  if (next) document.querySelector<HTMLInputElement>(`[data-test="counted-${next.itemId}"]`)?.focus()
}

// Every count field: whole numbers only, since a count is whole millilitres or items; no steppers.
const FIELD = {
  min: 0,
  increment: false,
  decrement: false,
  class: 'w-full',
  ui: { base: 'h-12 text-base' },
  formatOptions: { maximumFractionDigits: 0 },
} as const
</script>

<template>
  <!-- A container, because the show-night column is a phone's at any window: a line lays out by
       the width it is given, never the window's (issue 1520). -->
  <div class="@container space-y-6">
    <div
      class="space-y-6"
      data-test="stocktake-lines"
    >
      <p
        v-if="visibleGroups.length === 0"
        class="py-6 text-center text-sm text-muted"
      >
        {{ uncountedOnly ? 'Everything is counted.' : 'Nothing to count.' }}
      </p>

      <section
        v-for="group in visibleGroups"
        :key="group.name"
        class="space-y-2"
      >
        <h3 class="text-sm font-medium text-muted">
          {{ group.name }}
        </h3>
        <ul class="divide-y divide-default rounded-md border border-default">
          <li
            v-for="line in group.lines"
            :key="line.itemId"
            class="grid gap-3 p-3 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)_minmax(0,14rem)] @3xl:items-center"
            :data-test="`line-${line.itemId}`"
          >
            <div class="min-w-0">
              <p class="font-medium">
                {{ line.itemName }}
              </p>
              <p class="text-xs text-muted">
                {{ countedIn(line) }}
              </p>
            </div>

            <div
              class="flex items-center gap-2"
              :data-test="`count-fields-${line.itemId}`"
              @focusout="released"
            >
              <template v-if="open && byContainer(line)">
                <UInputNumber
                  v-bind="FIELD"
                  :model-value="shown(line, 'full')"
                  placeholder="Full"
                  :aria-label="`Full containers, ${line.itemName}`"
                  :data-test="`counted-${line.itemId}`"
                  @update:model-value="value => commitHalf(line, 'full', value ?? undefined)"
                  @keydown.enter.prevent="focusNext(line, 'full')"
                />
                <UInputNumber
                  v-bind="FIELD"
                  :model-value="shown(line, 'part')"
                  :max="line.containerMl"
                  placeholder="Open, ml"
                  :aria-label="`Millilitres left in the open one, ${line.itemName}`"
                  :data-test="`counted-part-${line.itemId}`"
                  @update:model-value="value => commitHalf(line, 'part', value ?? undefined)"
                  @keydown.enter.prevent="focusNext(line, 'part')"
                />
              </template>
              <UInputNumber
                v-else-if="open"
                v-bind="FIELD"
                :model-value="drafts[line.itemId]"
                placeholder="Uncounted"
                :aria-label="`Counted, ${line.itemName}`"
                :data-test="`counted-${line.itemId}`"
                @update:model-value="value => commit(line, value ?? null)"
                @keydown.enter.prevent="focusNext(line, 'single')"
              />
              <span v-else>
                {{ line.countedQty === null ? 'Uncounted' : saysCount(line.countedQty, line.unit, line.containerMl) }}
              </span>
              <UBadge
                v-if="open && !counted(line)"
                color="neutral"
                variant="subtle"
                size="sm"
                class="shrink-0"
                :data-test="`uncounted-badge-${line.itemId}`"
              >
                Uncounted
              </UBadge>
            </div>

            <div class="space-y-0.5 text-sm @3xl:text-right">
              <template v-if="!open || counted(line)">
                <p
                  v-if="open && byContainer(line)"
                  class="text-muted"
                >
                  {{ saysCount(drafts[line.itemId]!, line.unit, line.containerMl) }}
                </p>
                <p
                  v-if="line.expectedQty !== null"
                  class="text-muted"
                  :data-test="`expected-${line.itemId}`"
                >
                  Expected {{ saysQuantity(line.expectedQty, line.unit) }}
                </p>
                <p v-if="variance(line) !== null">
                  Variance
                  <span
                    class="font-mono"
                    :data-test="`variance-${line.itemId}`"
                  >{{ saysQuantity(variance(line)!, line.unit) }}</span>
                  <span
                    v-if="atCost(line)"
                    class="font-mono text-muted"
                  >, {{ atCost(line) }}</span>
                </p>
              </template>
              <p
                v-if="line.countedByName && !dirty(line)"
                class="text-xs text-muted"
                :data-test="`counted-by-${line.itemId}`"
              >
                Counted by {{ line.countedByName }}
              </p>
              <p
                v-if="open && state[line.itemId]"
                class="text-xs"
                :class="state[line.itemId] === 'failed' ? 'text-error' : 'text-muted'"
                :data-test="`line-state-${line.itemId}`"
              >
                {{ state[line.itemId] === 'saving' ? 'Saving' : state[line.itemId] === 'saved' ? 'Saved' : `Not saved: ${errors[line.itemId]}` }}
              </p>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <div
      v-if="open"
      class="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-md border border-default bg-default p-3"
      data-test="stocktake-footer"
    >
      <p class="text-sm">
        <span data-test="stocktake-progress">{{ countedTotal }} of {{ lines.length }} counted</span><span
          v-if="failedTotal > 0"
          class="text-error"
        >, {{ plural(failedTotal, 'line') }} not saved</span><span
          v-else-if="savingNow"
          class="text-muted"
        >, saving</span>
      </p>
      <USwitch
        v-model="uncountedOnly"
        data-test="uncounted-only-filter"
        label="Only uncounted"
        :ui="{ root: 'items-center', label: 'py-3.5' }"
      />
      <div
        v-if="$slots.actions"
        class="ml-auto flex gap-2"
      >
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>
