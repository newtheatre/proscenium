<!-- One room booking (spec part 5, "A booking"; SP-18): when and where, what for, its history, and
     what its booker may still do: change the details, cancel, or withdraw a request. Staff cancelling
     someone else's booking say why, and the booker is sent their note. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { BookingState } from '../../../../../shared/states'

interface Booking {
  id: string
  bookableName: string
  purpose: string
  state: BookingState
  startsAt: number
  endsAt: number
  title: string
  notes: string | null
  attendees: number | null
  productionTitle: string | null
  bookedForName: string
  origin: { type: string, id: string } | null
  decisionNote: string | null
  closedReason: string | null
  lateCancel: boolean
  overrideReason: string | null
  history: { kind: string, at: number, note: string | null, byBooker: boolean }[]
}

const { t } = useT()
const dates = useDates()
const route = useRoute()
const { $api } = useNuxtApp()
const toast = useToast()
const { confirm } = useConfirm()
const id = computed(() => String(route.params.id))

const { data, status, error, refresh } = await useAPI<{ booking: Booking, own: boolean, manage: boolean }>(() => `/api/spaces/bookings/${id.value}`, { key: `spaces:booking:${id.value}` })

const b = computed(() => data.value?.booking)
const live = computed(() => !!b.value && (b.value.state === 'confirmed' || b.value.state === 'requested') && b.value.endsAt > Date.now())
const elsewhere = computed(() => !!b.value?.origin && !data.value?.manage)
const TONE: Partial<Record<BookingState, 'success' | 'warning' | 'danger' | 'info' | 'neutral'>> = { confirmed: 'success', requested: 'warning', declined: 'danger', bumped: 'danger', completed: 'info' }

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const editing = ref(false)
const details = reactive({ title: '', attendees: null as number | null, notes: '' })
function startEdit() {
  if (!b.value) return
  Object.assign(details, { title: b.value.title, attendees: b.value.attendees, notes: b.value.notes ?? '' })
  refusal.value = null
  editing.value = true
}
async function saveDetails() {
  refusal.value = null
  try {
    await $api(`/api/spaces/bookings/${id.value}`, { method: 'PATCH', body: { title: details.title.trim(), attendees: details.attendees, notes: details.notes.trim() || null } })
    editing.value = false
    toast.add({ title: t('spaces.booking-page.saved'), color: 'success' })
    await refresh()
  }
  catch (e) { refusal.value = toRefusal(e) }
}

const cancelling = ref(false)
const cancelState = reactive({ note: '' })
const detailsEl = useFormRef('detailsEl')
const cancelEl = useFormRef('cancelEl')
const byStaff = computed(() => !data.value?.own)
async function cancel() {
  refusal.value = null
  if (!byStaff.value) {
    const ok = await confirm({ verb: t('spaces.booking-page.cancel'), thing: b.value!.title, consequence: t('spaces.booking-page.cancel-consequence'), button: t('spaces.booking-page.cancel-button') })
    if (!ok) return
    return send()
  }
  cancelState.note = ''
  cancelling.value = true
}
async function send() {
  try {
    const { late } = await $api<{ late: boolean }>(`/api/spaces/bookings/${id.value}/cancel`, { method: 'POST', body: { note: cancelState.note.trim() || null } })
    cancelling.value = false
    toast.add({ title: t(late ? 'spaces.booking-page.cancelled-late' : 'spaces.booking-page.cancelled'), color: 'success' })
    await refresh()
  }
  catch (e) { refusal.value = toRefusal(e) }
}
async function withdraw() {
  refusal.value = null
  const ok = await confirm({ verb: t('spaces.booking-page.withdraw'), thing: b.value!.title, consequence: t('spaces.booking-page.withdraw-consequence'), button: t('spaces.booking-page.withdraw-button') })
  if (!ok) return
  try {
    await $api(`/api/spaces/bookings/${id.value}/withdraw`, { method: 'POST' })
    toast.add({ title: t('spaces.booking-page.withdrawn'), color: 'success' })
    await refresh()
  }
  catch (e) { refusal.value = toRefusal(e) }
}

const primary = computed(() => live.value && !elsewhere.value ? { label: t('spaces.booking-page.edit'), icon: 'i-lucide-pencil' } : undefined)
const actions = computed<DropdownMenuItem[][]>(() => {
  if (!live.value || elsewhere.value || !b.value) return []
  return [[b.value.state === 'requested'
    ? { label: t('spaces.booking-page.withdraw'), icon: 'i-lucide-undo-2', color: 'error', onSelect: withdraw }
    : { label: t('spaces.booking-page.cancel'), icon: 'i-lucide-x', color: 'error', onSelect: cancel }]]
})
const summary = computed(() => {
  const x = b.value
  if (!x) return []
  return [
    { label: t('spaces.booking-page.when'), value: dates.range(x.startsAt, x.endsAt, 'dateTime') },
    { label: t('spaces.booking-page.where'), value: x.bookableName },
    { label: t('spaces.booking-page.purpose'), value: x.productionTitle ? `${x.purpose}: ${x.productionTitle}` : x.purpose },
    { label: t('spaces.booking-page.booked-for'), value: x.bookedForName },
    ...(x.attendees ? [{ label: t('spaces.booking-page.attendees'), value: String(x.attendees) }] : []),
  ]
})
const tabs = computed(() => [{ id: 'details', label: t('spaces.booking-page.tabs.details') }, { id: 'history', label: t('spaces.booking-page.tabs.history') }])
const HISTORY_KINDS = ['requested', 'confirmed', 'declined', 'withdrawn', 'expired', 'changed', 'cancelled', 'bumped', 'completed', 'no-show-set', 'no-show-cleared', 'external-placed', 'reminder-sent']
</script>

<template>
  <div>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <PageRecord
        v-if="b"
        :title="b.title"
        :status="{ label: t(`spaces.states.${b.state}`), tone: TONE[b.state] ?? 'neutral' }"
        :primary="primary"
        :actions="actions"
        :summary="summary"
        record-type="spaces.booking"
        :record-id="b.id"
        :tabs="tabs"
        :trail="[{ label: t('spaces.mine.title'), to: '/members/spaces/bookings' }]"
        @primary="startEdit"
      >
        <template #tab-details>
          <div class="space-y-4">
            <RefusalNotice :refusal="refusal" />
            <UAlert
              v-if="elsewhere"
              color="neutral"
              variant="subtle"
              icon="i-lucide-link"
              :title="t('spaces.booking-page.elsewhere')"
            />
            <UAlert
              v-if="b.decisionNote"
              color="neutral"
              variant="subtle"
              icon="i-lucide-message-square"
              :title="t('spaces.booking-page.decision-note')"
              :description="b.decisionNote"
            />
            <UAlert
              v-if="b.overrideReason"
              color="warning"
              variant="subtle"
              icon="i-lucide-shield-alert"
              :title="t('spaces.booking-page.override')"
              :description="b.overrideReason"
            />
            <PageSection :title="t('spaces.booking-page.notes')">
              <p
                v-if="b.notes"
                class="whitespace-pre-line text-sm"
              >
                {{ b.notes }}
              </p>
              <p
                v-else
                class="text-sm text-muted"
              >
                {{ t('spaces.booking-page.no-notes') }}
              </p>
            </PageSection>
          </div>
        </template>
        <template #tab-history>
          <RecordList :label="t('spaces.booking-page.tabs.history')">
            <RecordListItem
              v-for="(h, i) in b.history"
              :key="i"
              :name="HISTORY_KINDS.includes(h.kind) ? t(`spaces.history.${h.kind}`) : h.kind"
              :description="[dates.dateTime(h.at), h.note].filter(Boolean).join(' · ')"
            />
          </RecordList>
        </template>
      </PageRecord>
    </DataBoundary>

    <UModal
      v-model:open="editing"
      :title="t('spaces.booking-page.edit')"
    >
      <template #body>
        <UForm
          id="spaces-booking-details"
          ref="detailsEl"
          :state="details"
          :validate="() => needs({ title: details.title })"
          class="space-y-4"
          novalidate
          @submit="saveDetails"
        >
          <UFormField
            :label="t('spaces.book.what')"
            name="title"
            required
          >
            <UInput
              v-model="details.title"
              :maxlength="120"
            />
          </UFormField>
          <UFormField :label="t('spaces.book.attendees')">
            <FieldNumber
              v-model="details.attendees"
              :min="1"
              :max="10000"
            />
          </UFormField>
          <UFormField :label="t('spaces.book.notes')">
            <UTextarea
              v-model="details.notes"
              :rows="3"
              :maxlength="1000"
            />
          </UFormField>
          <RefusalNotice :refusal="refusal" />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="spaces-booking-details"
          :loading="detailsEl?.loading"
          :label="t('spaces.booking-page.save')"
        />
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('spaces.book.cancel')"
          @click="editing = false"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="cancelling"
      :title="t('spaces.booking-page.cancel-for', { name: b?.bookedForName ?? '' })"
    >
      <template #body>
        <UForm
          id="spaces-booking-cancel"
          ref="cancelEl"
          :state="cancelState"
          :validate="() => needs({ note: cancelState.note })"
          class="space-y-4"
          novalidate
          @submit="send"
        >
          <UFormField
            :label="t('spaces.booking-page.cancel-note')"
            name="note"
            :help="t('spaces.booking-page.cancel-note-help')"
            required
          >
            <UTextarea
              v-model="cancelState.note"
              :rows="3"
              :maxlength="500"
            />
          </UFormField>
          <RefusalNotice :refusal="refusal" />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="spaces-booking-cancel"
          color="error"
          :loading="cancelEl?.loading"
          :label="t('spaces.booking-page.cancel-button')"
        />
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('spaces.booking-page.keep')"
          @click="cancelling = false"
        />
      </template>
    </UModal>
  </div>
</template>
