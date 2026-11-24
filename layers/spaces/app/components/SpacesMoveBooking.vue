<!-- Moving a booking to another time or room (SP-19, rules X2 and X3), in a dialog on the booking's
     page. The same live check as Book a room, leaving the booking's own time out; a move that needs
     a decision is sent as a request and the booking keeps its time until then. -->
<script setup lang="ts">
import { parseDate, parseDateTime, parseTime, toZoned } from '@internationalized/date'
import { watchDebounced } from '@vueuse/core'

interface Moving { id: string, bookableId: string, purposeId: string, startsAt: number, endsAt: number }
interface Option { id: string, name: string, venueName: string | null, kind: 'space' | 'resource', external: boolean, override: boolean, purposes: string[] }
interface Check { outcome: 'confirm' | 'request' | 'refused', rule: string | null, reason: string | null, remedy: string | null, external: boolean, blockers: { kind: string, startsAt: number, endsAt: number, label?: string }[], nearest: { startsAt: number, endsAt: number } | null, overridden: string[] }

const props = defineProps<{ booking: Moving }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ moved: [result: { bookingId: string, state: string }] }>()

const { t } = useT()
const dates = useDates()
const { $api } = useNuxtApp()

const options = ref<Option[]>([])
const form = reactive({ bookableId: '', day: '', start: '', end: '', overrideReason: '' })
const check = ref<Check | null>(null)
const checking = ref(false)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const formEl = useFormRef('formEl')

const clock = (ms: number) => dates.toLocal(ms).slice(11) // not-policy: the time part of "2027-09-01T19:30"
watch(open, async (now) => {
  if (!now) return
  refusal.value = null
  check.value = null
  Object.assign(form, { bookableId: props.booking.bookableId, day: dates.toLocal(props.booking.startsAt).slice(0, 10), start: clock(props.booking.startsAt), end: clock(props.booking.endsAt), overrideReason: '' }) // not-policy: the date part
  if (!options.value.length) options.value = (await $api<{ bookables: Option[] }>('/api/spaces/bookings/options')).bookables
}, { immediate: true })

const rooms = computed(() => options.value.filter(b => b.purposes.includes(props.booking.purposeId) || b.id === props.booking.bookableId)
  .map(b => ({ value: b.id, label: b.venueName && b.kind === 'space' ? `${b.name} (${b.venueName})` : b.name })))
const room = computed(() => options.value.find(b => b.id === form.bookableId))

function timeOf(value: string) {
  try { return value ? parseTime(value) : undefined }
  catch { return undefined }
}
const clockOf = (value: unknown) => value ? String(value).slice(0, 5) : '' // not-policy: HH:MM
const span = computed(() => {
  if (!form.day || !form.start || !form.end) return null
  try {
    const startsAt = toZoned(parseDateTime(`${form.day}T${form.start}`), dates.zone.value).toDate().getTime()
    const endDay = form.end <= form.start ? parseDate(form.day).add({ days: 1 }).toString() : form.day
    return { startsAt, endsAt: toZoned(parseDateTime(`${endDay}T${form.end}`), dates.zone.value).toDate().getTime() }
  }
  catch { return null }
})
const unchanged = computed(() => !!span.value && form.bookableId === props.booking.bookableId && span.value.startsAt === props.booking.startsAt && span.value.endsAt === props.booking.endsAt)
const body = computed(() => span.value && form.bookableId && !unchanged.value ? { bookableId: form.bookableId, ...span.value, overrideReason: form.overrideReason.trim() || null } : null)

watchDebounced(body, async (b) => {
  if (!b || !open.value) {
    check.value = null
    return
  }
  checking.value = true
  try { check.value = await $api<Check>('/api/spaces/bookings/check', { method: 'POST', body: { ...b, purposeId: props.booking.purposeId, replaces: props.booking.id } }) }
  catch { check.value = null }
  finally { checking.value = false }
}, { debounce: 400, deep: true }) // not-policy: a pause in typing

const OVERRIDABLE = ['P5', 'P6', 'P7', 'P8', 'P9']
const mayOverride = computed(() => !!room.value?.override && (form.overrideReason.length > 0 || (check.value?.outcome === 'refused' && OVERRIDABLE.includes(check.value.rule ?? ''))))
const verdict = computed(() => {
  const c = check.value
  if (!c) return null
  if (c.outcome === 'refused') return { color: 'error' as const, icon: 'i-lucide-circle-x', title: c.reason ?? t('spaces.book.refused'), description: c.remedy ?? undefined }
  if (c.outcome === 'request') return { color: 'warning' as const, icon: 'i-lucide-hourglass', title: t('spaces.move.will-request'), description: undefined }
  return { color: 'success' as const, icon: 'i-lucide-circle-check', title: t('spaces.move.will-move'), description: undefined }
})
function takeNearest() {
  const n = check.value?.nearest
  if (!n) return
  form.day = dates.toLocal(n.startsAt).slice(0, 10) // not-policy: the date part
  form.start = clock(n.startsAt)
  form.end = clock(n.endsAt)
}

async function save() {
  if (!body.value) return
  refusal.value = null
  try {
    const made = await $api<{ bookingId: string, state: string }>(`/api/spaces/bookings/${props.booking.id}/move`, { method: 'POST', body: body.value })
    open.value = false
    emit('moved', made)
  }
  catch (e) { refusal.value = toRefusal(e) }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('spaces.move.title')"
    :description="t('spaces.move.description')"
  >
    <template #body>
      <UForm
        id="spaces-move"
        ref="formEl"
        :state="form"
        :validate="() => needs({ bookableId: form.bookableId, day: form.day, start: form.start, end: form.end })"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <UFormField
          :label="t('spaces.book.room')"
          name="bookableId"
          required
        >
          <USelect
            v-model="form.bookableId"
            :items="rooms"
            class="min-w-64"
          />
        </UFormField>
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
        <div aria-live="polite">
          <UAlert
            v-if="verdict"
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
        <RefusalNotice :refusal="refusal" />
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="spaces-move"
        :loading="formEl?.loading"
        :disabled="!body || check?.outcome === 'refused'"
        :label="check?.outcome === 'request' ? t('spaces.move.send-request') : t('spaces.move.move')"
      />
      <UButton
        color="neutral"
        variant="ghost"
        :label="t('spaces.book.cancel')"
        @click="open = false"
      />
    </template>
  </UModal>
</template>
