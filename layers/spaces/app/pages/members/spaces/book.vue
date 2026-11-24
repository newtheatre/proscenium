<!-- Book a room (spec part 5, "Book a room"; SP-15 to SP-17): what for, then where and when. As the
     person fills it in, a line under the form says what would happen: booked at once, sent for a
     decision, or refused with the rule's reason and the nearest free time. -->
<script setup lang="ts">
import { parseDateTime, parseDate, parseTime, toZoned, today } from '@internationalized/date'
import { watchDebounced } from '@vueuse/core'
import { seriesDates, weekdayOf, type Frequency } from '../../../../shared/series'

interface Bookable { id: string, name: string, kind: 'space' | 'resource', venueName: string | null, external: boolean, approvalNote: string | null, guidance: string | null, capacity: number | null, manage: boolean, override: boolean, purposes: string[] }
interface Purpose { id: string, name: string, description: string | null, tier: number, openTo: string, needsProduction: boolean, mayRepeat: boolean }
interface Options { bookables: Bookable[], purposes: Purpose[], productions: { id: string, title: string }[], slotMinutes: number }
interface Check {
  outcome: 'confirm' | 'request' | 'refused'
  rule: string | null
  reason: string | null
  remedy: string | null
  external: boolean
  blockers: { kind: string, startsAt: number, endsAt: number, label?: string }[]
  nearest: { startsAt: number, endsAt: number } | null
  waiting: number
  overridden: string[]
  bumps: boolean
}
interface Occurrence { date: string, startsAt: number | null, endsAt: number | null, outcome: 'confirm' | 'request' | 'refused', rule: string | null, code: string | null, reason: string | null }
interface SeriesCheck { occurrences: Occurrence[], needsDecision: boolean }

const { t } = useT()
const route = useRoute()
const dates = useDates()
const { $api } = useNuxtApp()
const toast = useToast()

const { data, status, error, refresh } = await useAPI<Options>('/api/spaces/bookings/options', { key: 'spaces:book-options' })

const NONE = 'none'
const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined
const form = reactive({
  purposeId: '',
  productionId: NONE,
  bookableId: one(route.query.room) ?? '',
  day: one(route.query.day) ?? today(dates.zone.value).toString(),
  start: '',
  end: '',
  bookedFor: undefined as string | undefined,
  overrideReason: '',
  title: '',
  attendees: null as number | null,
  notes: '',
  repeat: false,
  frequency: 'weekly' as Frequency,
  weekdays: [] as string[],
  endBy: 'date' as 'date' | 'count',
  lastDate: '',
  count: 10 as number | null,
})

const purpose = computed(() => data.value?.purposes.find(p => p.id === form.purposeId))
const bookable = computed(() => data.value?.bookables.find(b => b.id === form.bookableId))
const staffAnywhere = computed(() => !!data.value?.bookables.some(b => b.manage))

const purposeItems = computed(() => (data.value?.purposes ?? []).map(p => ({ value: p.id, label: p.name, description: p.description ?? undefined })))
const productionItems = computed(() => [{ value: NONE, label: t('spaces.book.no-production') }, ...(data.value?.productions ?? []).map(p => ({ value: p.id, label: p.title }))])
// Rooms that allow the purpose; rooms booked elsewhere come last under their own heading (SP-11).
const bookableItems = computed(() => {
  const open = (data.value?.bookables ?? []).filter(b => !form.purposeId || b.purposes.includes(form.purposeId))
  const label = (b: Bookable) => b.venueName && b.kind === 'space' ? `${b.name} (${b.venueName})` : b.name
  const here = open.filter(b => !b.external).map(b => ({ value: b.id, label: label(b) }))
  const elsewhere = open.filter(b => b.external).map(b => ({ value: b.id, label: label(b) }))
  return elsewhere.length ? [here, [{ type: 'label' as const, label: t('spaces.book.elsewhere') }, ...elsewhere]] : [here]
})
watch(() => form.purposeId, () => {
  if (form.bookableId && bookable.value && !bookable.value.purposes.includes(form.purposeId)) form.bookableId = ''
  if (!purpose.value?.needsProduction) form.productionId = NONE
  if (!purpose.value?.mayRepeat) form.repeat = false
})

function timeOf(value: string) {
  try { return value ? parseTime(value) : undefined }
  catch { return undefined }
}
const clockOf = (value: unknown) => value ? String(value).slice(0, 5) : '' // not-policy: HH:MM
const clock = (ms: number) => dates.toLocal(ms).slice(11) // not-policy: the time part of "2027-09-01T19:30"
/** The instants the form describes. An end at or before the start is past midnight, on the next day. */
const span = computed(() => {
  if (!form.day || !form.start || !form.end) return null
  try {
    const startsAt = toZoned(parseDateTime(`${form.day}T${form.start}`), dates.zone.value).toDate().getTime()
    const endDay = form.end <= form.start ? parseDate(form.day).add({ days: 1 }).toString() : form.day
    const endsAt = toZoned(parseDateTime(`${endDay}T${form.end}`), dates.zone.value).toDate().getTime()
    return { startsAt, endsAt }
  }
  catch { return null }
})

const ask = computed(() => {
  if (form.repeat || !form.purposeId || !form.bookableId || !span.value) return null
  return {
    bookableId: form.bookableId,
    purposeId: form.purposeId,
    ...span.value,
    productionId: form.productionId === NONE ? null : form.productionId,
    bookedFor: form.bookedFor ?? null,
    overrideReason: form.overrideReason.trim() || null,
  }
})

const check = ref<Check | null>(null)
const checking = ref(false)
watchDebounced(ask, async (body) => {
  if (!body) {
    check.value = null
    return
  }
  checking.value = true
  try { check.value = await $api<Check>('/api/spaces/bookings/check', { method: 'POST', body }) }
  catch { check.value = null }
  finally { checking.value = false }
}, { debounce: 400, deep: true }) // not-policy: a pause in typing

// A series (part 3, R1 to R5): every date is checked, and a refused one is booked only when left out.
const MINUTE = 60_000 // not-policy: unit of time
const COUNT_HORIZON = 800 // not-policy: days enough for 104 monthly dates
const weekdayItems = computed(() => [1, 2, 3, 4, 5, 6, 7].map(d => ({ value: String(d), label: t(`spaces.book.weekday.${d}`) })))
const frequencyItems = computed(() => (['daily', 'weekly', 'fortnightly', 'monthly-by-weekday'] as const).map(f => ({ value: f, label: t(`spaces.book.frequency.${f}`) })))
const endItems = computed(() => [{ value: 'date', label: t('spaces.book.end-by-date') }, { value: 'count', label: t('spaces.book.end-by-count') }])
const byWeekday = computed(() => form.frequency === 'weekly' || form.frequency === 'fortnightly')
watch(() => [form.repeat, form.day], () => {
  if (form.repeat && !form.weekdays.length && form.day) form.weekdays = [String(weekdayOf(form.day))]
})
const weekdays = computed(() => byWeekday.value ? form.weekdays.map(Number) : null)
const lastDate = computed(() => {
  if (form.endBy === 'date') return form.lastDate
  if (!form.day || !form.count) return ''
  const far = parseDate(form.day).add({ days: COUNT_HORIZON }).toString()
  return seriesDates({ frequency: form.frequency, first: form.day, last: far, weekdays: weekdays.value }, form.count).at(-1) ?? ''
})
const seriesAsk = computed(() => {
  if (!form.repeat || !form.purposeId || !form.bookableId || !span.value || !lastDate.value) return null
  return {
    bookableId: form.bookableId,
    purposeId: form.purposeId,
    productionId: form.productionId === NONE ? null : form.productionId,
    bookedFor: form.bookedFor ?? null,
    overrideReason: form.overrideReason.trim() || null,
    frequency: form.frequency,
    weekdays: weekdays.value,
    startsLocal: form.start,
    lengthMinutes: Math.round((span.value.endsAt - span.value.startsAt) / MINUTE),
    firstDate: form.day,
    lastDate: lastDate.value,
  }
})
const series = ref<SeriesCheck | null>(null)
const seriesRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
const leftOut = ref<string[]>([])
async function checkSeriesNow(body = seriesAsk.value) {
  seriesRefusal.value = null
  if (!body) {
    series.value = null
    return
  }
  checking.value = true
  try {
    series.value = await $api<SeriesCheck>('/api/spaces/series/check', { method: 'POST', body })
    const dates = new Set(series.value.occurrences.map(o => o.date))
    leftOut.value = leftOut.value.filter(d => dates.has(d))
  }
  catch (e) {
    series.value = null
    seriesRefusal.value = toRefusal(e)
  }
  finally { checking.value = false }
}
watchDebounced(seriesAsk, body => checkSeriesNow(body), { debounce: 400, deep: true }) // not-policy: a pause in typing
const seriesCounts = computed(() => {
  const all = series.value?.occurrences ?? []
  const kept = all.filter(o => !leftOut.value.includes(o.date))
  return { all: all.length, kept: kept.length, blocked: kept.filter(o => o.outcome === 'refused').length }
})
const seriesVerdict = computed(() => {
  const s = series.value
  if (!s) return null
  const { blocked, kept } = seriesCounts.value
  if (blocked) return { color: 'error' as const, icon: 'i-lucide-circle-x', title: t('spaces.book.series-blocked', { count: blocked }), description: t('spaces.book.series-blocked-help') }
  if (!kept) return { color: 'error' as const, icon: 'i-lucide-circle-x', title: t('spaces.book.series-none'), description: undefined }
  if (s.needsDecision) return { color: 'warning' as const, icon: 'i-lucide-hourglass', title: t('spaces.book.series-request'), description: bookable.value?.approvalNote ?? undefined }
  return { color: 'success' as const, icon: 'i-lucide-circle-check', title: t('spaces.book.series-confirm'), description: undefined }
})
const outcomeBadge = (o: Occurrence) => leftOut.value.includes(o.date)
  ? { color: 'neutral' as const, label: t('spaces.book.left-out') }
  : o.outcome === 'refused'
    ? { color: 'error' as const, label: t('spaces.book.outcome.refused') }
    : o.outcome === 'request'
      ? { color: 'warning' as const, label: t('spaces.book.outcome.request') }
      : { color: 'success' as const, label: t('spaces.book.outcome.confirm') }
function toggleLeftOut(date: string, out: boolean | 'indeterminate') {
  leftOut.value = out === true ? [...leftOut.value, date] : leftOut.value.filter(d => d !== date)
}

const OVERRIDABLE = ['P5', 'P6', 'P7', 'P8', 'P9', 'B3']
const mayOverride = computed(() => !!bookable.value?.override && (form.overrideReason.length > 0
  || !!check.value?.overridden.length || (check.value?.outcome === 'refused' && OVERRIDABLE.includes(check.value.rule ?? ''))
  || !!series.value?.occurrences.some(o => o.outcome === 'refused' && OVERRIDABLE.includes(o.rule ?? ''))))

const verdict = computed(() => {
  const c = check.value
  if (!c) return null
  if (c.outcome === 'refused') {
    return { color: 'error' as const, icon: 'i-lucide-circle-x', title: c.reason ?? t('spaces.book.refused'), description: c.remedy ?? undefined }
  }
  if (c.outcome === 'request') {
    const title = c.bumps ? t('spaces.book.will-bump', { count: c.blockers.length }) : c.external ? t('spaces.book.will-ask-elsewhere') : t('spaces.book.will-request')
    const waiting = c.waiting ? t('spaces.book.waiting', { count: c.waiting }) : undefined
    const overriding = c.overridden.length ? t('spaces.book.overriding') : undefined
    return { color: 'warning' as const, icon: 'i-lucide-hourglass', title, description: [bookable.value?.approvalNote, waiting, overriding].filter(Boolean).join(' ') || undefined }
  }
  return { color: 'success' as const, icon: 'i-lucide-circle-check', title: t('spaces.book.will-confirm'), description: c.overridden.length ? t('spaces.book.overriding') : undefined }
})
function takeNearest() {
  const n = check.value?.nearest
  if (!n) return
  form.day = dates.toLocal(n.startsAt).slice(0, 10) // not-policy: the date part
  form.start = clock(n.startsAt)
  form.end = clock(n.endsAt)
}

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const formEl = useFormRef('formEl')
const validate = () => needs({
  purposeId: form.purposeId, bookableId: form.bookableId, day: form.day, start: form.start, end: form.end, title: form.title,
  ...(purpose.value?.needsProduction ? { productionId: form.productionId === NONE ? '' : form.productionId } : {}),
  ...(form.repeat && form.endBy === 'date' ? { lastDate: form.lastDate } : {}),
  ...(form.repeat && form.endBy === 'count' ? { count: form.count ? String(form.count) : '' } : {}),
})
const titled = computed(() => form.title.trim().length >= 3) // not-policy: as the title's minimum
const ready = computed(() => form.repeat
  ? !!seriesAsk.value && !!series.value && titled.value && !seriesCounts.value.blocked && seriesCounts.value.kept > 0
  : !!ask.value && titled.value && check.value?.outcome !== 'refused')
const submitLabel = computed(() => {
  if (form.repeat && series.value) return t(series.value.needsDecision ? 'spaces.book.request-some' : 'spaces.book.book-some', { n: seriesCounts.value.kept, m: seriesCounts.value.all })
  return check.value?.outcome === 'request' ? t('spaces.book.send-request') : t('spaces.book.book')
})
async function saveSeries() {
  if (!seriesAsk.value) return
  try {
    const made = await $api<{ seriesId: string, state: string, occurrences: number }>('/api/spaces/series', {
      method: 'POST',
      body: { ...seriesAsk.value, leaveOut: leftOut.value, title: form.title.trim(), notes: form.notes.trim() || null, attendees: form.attendees },
    })
    toast.add({ title: t(made.state === 'confirmed' ? 'spaces.book.booked-series' : 'spaces.book.requested-series', { count: made.occurrences }), color: 'success' })
    await navigateTo('/members/spaces/bookings')
  }
  catch (e) {
    refusal.value = toRefusal(e)
    // R4: a date taken since the check refuses the whole series, so the list is checked again.
    await checkSeriesNow()
  }
}
async function save() {
  refusal.value = null
  if (form.repeat) return await saveSeries()
  if (!ask.value) return
  try {
    const made = await $api<{ bookingId: string, state: string }>('/api/spaces/bookings', {
      method: 'POST',
      body: { ...ask.value, title: form.title.trim(), notes: form.notes.trim() || null, attendees: form.attendees },
    })
    toast.add({ title: t(made.state === 'confirmed' ? 'spaces.book.booked' : 'spaces.book.requested'), color: 'success' })
    await navigateTo(`/members/spaces/bookings/${made.bookingId}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame
    :title="t('spaces.book.title')"
    :description="t('spaces.book.description')"
    width="reading"
    :trail="[{ label: t('spaces.calendar.title'), to: '/members/spaces' }]"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <EmptyState
          v-if="!d.bookables.length"
          icon="i-lucide-door-closed"
          :title="t('spaces.book.no-rooms')"
          :description="t('spaces.book.no-rooms-why')"
        />
        <UForm
          v-else
          ref="formEl"
          :state="form"
          :validate="validate"
          class="space-y-6"
          novalidate
          @submit="save"
        >
          <UFormField
            :label="t('spaces.book.purpose')"
            name="purposeId"
            required
          >
            <USelect
              v-model="form.purposeId"
              :items="purposeItems"
              :placeholder="t('spaces.book.purpose-placeholder')"
              class="min-w-64"
            />
          </UFormField>
          <UFormField
            v-if="purpose?.needsProduction"
            :label="t('spaces.book.production')"
            name="productionId"
            :help="d.productions.length ? undefined : t('spaces.book.no-productions')"
            required
          >
            <USelect
              v-model="form.productionId"
              :items="productionItems"
              class="min-w-64"
            />
          </UFormField>
          <UFormField
            :label="t('spaces.book.room')"
            name="bookableId"
            required
          >
            <USelect
              v-model="form.bookableId"
              :items="bookableItems"
              :placeholder="t('spaces.book.room-placeholder')"
              class="min-w-64"
            />
          </UFormField>
          <UAlert
            v-if="bookable?.guidance"
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            :description="bookable.guidance"
          />
          <div class="flex flex-wrap items-end gap-4">
            <UFormField
              :label="t('spaces.book.day')"
              name="day"
              required
            >
              <FieldDate v-model="form.day" />
            </UFormField>
            <UFormField
              :label="t('spaces.book.from')"
              name="start"
              required
            >
              <UInputTime
                :model-value="timeOf(form.start)"
                :hour-cycle="24"
                @update:model-value="form.start = clockOf($event)"
              />
            </UFormField>
            <UFormField
              :label="t('spaces.book.to')"
              name="end"
              required
            >
              <UInputTime
                :model-value="timeOf(form.end)"
                :hour-cycle="24"
                @update:model-value="form.end = clockOf($event)"
              />
            </UFormField>
          </div>
          <template v-if="purpose?.mayRepeat">
            <UCheckbox
              v-model="form.repeat"
              :label="t('spaces.book.repeat')"
              :description="t('spaces.book.repeat-help')"
            />
            <div
              v-if="form.repeat"
              class="space-y-4 border-s border-default ps-4"
            >
              <UFormField
                :label="t('spaces.book.frequency')"
                name="frequency"
              >
                <USelect
                  v-model="form.frequency"
                  :items="frequencyItems"
                  class="min-w-64"
                />
              </UFormField>
              <UFormField
                v-if="byWeekday"
                :label="t('spaces.book.weekdays')"
                name="weekdays"
              >
                <UCheckboxGroup
                  v-model="form.weekdays"
                  :items="weekdayItems"
                  orientation="horizontal"
                />
              </UFormField>
              <UFormField
                :label="t('spaces.book.ends')"
                name="endBy"
              >
                <URadioGroup
                  v-model="form.endBy"
                  :items="endItems"
                  orientation="horizontal"
                />
              </UFormField>
              <UFormField
                v-if="form.endBy === 'date'"
                :label="t('spaces.book.last-date')"
                name="lastDate"
                required
              >
                <FieldDate v-model="form.lastDate" />
              </UFormField>
              <UFormField
                v-else
                :label="t('spaces.book.count')"
                name="count"
                required
              >
                <FieldNumber
                  v-model="form.count"
                  :min="2"
                  :max="104"
                />
              </UFormField>
            </div>
          </template>
          <div
            v-if="form.repeat && (seriesVerdict || seriesRefusal)"
            aria-live="polite"
            class="space-y-2"
          >
            <RefusalNotice :refusal="seriesRefusal" />
            <UAlert
              v-if="seriesVerdict"
              :color="seriesVerdict.color"
              variant="subtle"
              :icon="checking ? 'i-lucide-loader-circle' : seriesVerdict.icon"
              :title="seriesVerdict.title"
              :description="seriesVerdict.description"
            />
            <RecordList
              v-if="series"
              :label="t('spaces.book.dates')"
            >
              <RecordListItem
                v-for="o in series.occurrences"
                :key="o.date"
                :name="dates.dayNamed(o.date)"
                :description="o.outcome === 'refused' ? o.reason ?? undefined : undefined"
                :muted="leftOut.includes(o.date)"
              >
                <UBadge
                  :color="outcomeBadge(o).color"
                  variant="subtle"
                  :label="outcomeBadge(o).label"
                />
                <UCheckbox
                  v-if="o.outcome === 'refused'"
                  :model-value="leftOut.includes(o.date)"
                  :label="t('spaces.book.leave-out')"
                  @update:model-value="toggleLeftOut(o.date, $event)"
                />
              </RecordListItem>
            </RecordList>
          </div>
          <div
            v-if="!form.repeat && verdict"
            aria-live="polite"
          >
            <UAlert
              :color="verdict.color"
              variant="subtle"
              :icon="checking ? 'i-lucide-loader-circle' : verdict.icon"
              :title="verdict.title"
              :description="verdict.description"
            >
              <template
                v-if="check?.nearest"
                #actions
              >
                <UButton
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :label="t('spaces.book.take-nearest', { when: dates.range(check.nearest.startsAt, check.nearest.endsAt, 'dateTime') })"
                  @click="takeNearest"
                />
              </template>
            </UAlert>
            <ul
              v-if="check?.blockers.length"
              class="mt-2 space-y-1 text-sm text-muted"
            >
              <li
                v-for="(b, i) in check.blockers"
                :key="i"
              >
                {{ t(`spaces.book.blocker.${b.kind}`, { what: b.label ?? t('spaces.calendar.booked'), from: dates.time(b.startsAt), to: dates.time(b.endsAt) }) }}
              </li>
            </ul>
          </div>
          <UFormField
            v-if="mayOverride"
            :label="t('spaces.book.override')"
            :help="t('spaces.book.override-help')"
          >
            <UTextarea
              v-model="form.overrideReason"
              :rows="2"
              :maxlength="300"
            />
          </UFormField>
          <UFormField
            v-if="staffAnywhere"
            :label="t('spaces.book.for')"
            :help="t('spaces.book.for-help')"
          >
            <PersonPicker
              v-model="form.bookedFor"
              :placeholder="t('spaces.book.for-me')"
            />
          </UFormField>
          <UFormField
            :label="t('spaces.book.what')"
            name="title"
            :help="t('spaces.book.what-help')"
            required
          >
            <UInput
              v-model="form.title"
              :maxlength="120"
            />
          </UFormField>
          <UFormField
            :label="t('spaces.book.attendees')"
            :help="bookable?.capacity ? t('spaces.book.capacity', { count: bookable.capacity }) : undefined"
          >
            <FieldNumber
              v-model="form.attendees"
              :min="1"
              :max="10000"
            />
          </UFormField>
          <UFormField :label="t('spaces.book.notes')">
            <UTextarea
              v-model="form.notes"
              :rows="3"
              :maxlength="1000"
            />
          </UFormField>
          <RefusalNotice :refusal="refusal" />
          <div class="flex gap-2">
            <UButton
              type="submit"
              :label="submitLabel"
              :loading="formEl?.loading"
              :disabled="!ready"
            />
            <UButton
              to="/members/spaces"
              color="neutral"
              variant="ghost"
              :label="t('spaces.book.cancel')"
            />
          </div>
        </UForm>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
