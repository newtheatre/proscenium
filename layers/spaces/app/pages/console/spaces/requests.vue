<!-- Room booking requests (spec part 5, "Requests"; SP-25 to SP-28, SP-30): the requests this person
     may decide, soonest first, each with its clashes and the booker's record. Confirm or decline with
     a note the booker is sent; for a room booked elsewhere, mark it asked, then confirm with the
     owner's reference. A request that is the viewer's own is shown, but someone else decides it. -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

interface Row {
  id: string
  bookableName: string
  external: boolean
  startsAt: number
  endsAt: number
  title: string
  notes: string | null
  attendees: number | null
  purpose: string
  tier: number
  productionTitle: string | null
  bookedForName: string
  requestedAt: number
  asked: boolean
  urgent: boolean
  seriesId: string | null
  replaces: boolean
  clashes: number
  own: boolean
  record: { noShows: number, lateCancels: number }
}

const { t } = useT()
const { $api } = useNuxtApp()
const dates = useDates()
const toast = useToast()

const { data, status, error, refresh } = await useAPI<{ requests: Row[] }>('/api/spaces/requests', { key: 'spaces:requests' })

// A7: a series is one request, shown once with how many of its dates wait.
const rows = computed(() => {
  const counts = new Map<string, number>()
  for (const r of data.value?.requests ?? []) if (r.seriesId) counts.set(r.seriesId, (counts.get(r.seriesId) ?? 0) + 1)
  const seen = new Set<string>()
  return (data.value?.requests ?? []).filter((r) => {
    if (!r.seriesId) return true
    if (seen.has(r.seriesId)) return false
    seen.add(r.seriesId)
    return true
  }).map(r => ({ ...r, dates: r.seriesId ? counts.get(r.seriesId) ?? 1 : 1 }))
})
type Shown = Row & { dates: number }

const describe = (r: Row) => [
  dates.range(r.startsAt, r.endsAt, 'dateTime'),
  r.bookableName,
  r.productionTitle ? `${r.purpose}: ${r.productionTitle}` : r.purpose,
  t('spaces.requests.by', { name: r.bookedForName }),
].join(' · ')
const recordLine = (r: Row) => r.record.noShows || r.record.lateCancels
  ? t('spaces.requests.record', { noShows: r.record.noShows, lateCancels: r.record.lateCancels })
  : t('spaces.requests.record-clean')

const deciding = ref<{ row: Shown, verb: 'confirm' | 'decline' } | null>(null)
const open = computed({ get: () => !!deciding.value, set: (v: boolean) => { if (!v) deciding.value = null } })
const answer = reactive({ note: '', reference: '', whole: true })
const wholeSeries = computed(() => !!deciding.value?.row.seriesId && !deciding.value.row.external && answer.whole)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const formEl = useFormRef('formEl')
function start(row: Shown, verb: 'confirm' | 'decline') {
  Object.assign(answer, { note: '', reference: '', whole: true })
  refusal.value = null
  deciding.value = { row, verb }
}
const validate = () => {
  const d = deciding.value
  if (!d) return []
  if (d.verb === 'decline') return needs({ note: answer.note })
  return d.row.external ? needs({ reference: answer.reference }) : []
}
async function send() {
  const d = deciding.value
  if (!d) return
  refusal.value = null
  try {
    const body = d.verb === 'confirm' ? { note: answer.note.trim() || null, reference: answer.reference.trim() || null } : { note: answer.note.trim() }
    if (wholeSeries.value) await $api(`/api/spaces/series/${d.row.seriesId}/${d.verb}`, { method: 'POST', body: { note: body.note } })
    else await $api(`/api/spaces/bookings/${d.row.id}/${d.verb}`, { method: 'POST', body })
    toast.add({ title: t(d.verb === 'confirm' ? 'spaces.requests.confirmed' : 'spaces.requests.declined', { name: d.row.bookedForName }), color: 'success' })
    deciding.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function markAsked(row: Row) {
  try {
    await $api(`/api/spaces/bookings/${row.id}/placed`, { method: 'POST', body: {} })
    toast.add({ title: t('spaces.requests.asked-done'), color: 'success' })
    await refresh()
  }
  catch (e) {
    const refused = toRefusal(e)
    toast.add({ title: refused.reason, description: refused.remedy, color: 'error' })
  }
}
</script>

<template>
  <PageFrame
    :title="t('spaces.navigation.requests.label')"
    :description="t('spaces.requests.description')"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <EmptyState
          v-if="!d.requests.length"
          icon="i-lucide-inbox"
          :title="t('spaces.requests.empty')"
        />
        <RecordList
          v-else
          :label="t('spaces.navigation.requests.label')"
        >
          <RecordListItem
            v-for="r in rows"
            :key="r.id"
            :name="r.title"
            :description="describe(r)"
            :muted="r.own"
            align="start"
          >
            <template #below>
              <div class="mt-2 space-y-2 text-sm">
                <div class="flex flex-wrap gap-1">
                  <UBadge
                    v-if="r.urgent"
                    color="warning"
                    variant="subtle"
                    :label="t('spaces.requests.urgent')"
                  />
                  <UBadge
                    v-if="r.clashes"
                    color="neutral"
                    variant="subtle"
                    :label="t('spaces.requests.clashes', { count: r.clashes })"
                  />
                  <UBadge
                    v-if="r.external"
                    color="neutral"
                    variant="subtle"
                    :label="r.asked ? t('spaces.requests.asked') : t('spaces.requests.external')"
                  />
                  <UBadge
                    v-if="r.replaces"
                    color="neutral"
                    variant="subtle"
                    :label="t('spaces.requests.replaces')"
                  />
                  <UBadge
                    v-if="r.seriesId"
                    color="neutral"
                    variant="subtle"
                    :label="t('spaces.requests.series-dates', { count: r.dates })"
                  />
                </div>
                <p class="text-muted">
                  {{ t('spaces.requests.waited', { when: dates.dateTime(r.requestedAt) }) }} · {{ recordLine(r) }}
                </p>
                <p
                  v-if="r.notes"
                  class="whitespace-pre-line"
                >
                  {{ r.notes }}
                </p>
                <p
                  v-if="r.own"
                  class="text-muted"
                >
                  {{ t('spaces.requests.own') }}
                </p>
                <div
                  v-else
                  class="flex flex-wrap gap-2"
                >
                  <UButton
                    v-if="r.external && !r.asked"
                    size="sm"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-send"
                    :label="t('spaces.requests.mark-asked')"
                    loading-auto
                    @click="markAsked(r)"
                  />
                  <UButton
                    size="sm"
                    icon="i-lucide-check"
                    :label="t('spaces.requests.confirm')"
                    @click="start(r, 'confirm')"
                  />
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-x"
                    :label="t('spaces.requests.decline')"
                    @click="start(r, 'decline')"
                  />
                </div>
              </div>
            </template>
          </RecordListItem>
        </RecordList>
      </template>
    </DataBoundary>

    <UModal
      v-model:open="open"
      :title="deciding ? t(`spaces.requests.${deciding.verb}-title`, { title: deciding.row.title }) : ''"
    >
      <template #body>
        <UForm
          id="spaces-decide"
          ref="formEl"
          :state="answer"
          :validate="validate"
          class="space-y-4"
          novalidate
          @submit="send"
        >
          <UFormField
            v-if="deciding?.verb === 'confirm' && deciding.row.external"
            name="reference"
            :label="t('spaces.requests.reference')"
            :help="t('spaces.requests.reference-help')"
            required
          >
            <UInput
              v-model="answer.reference"
              :maxlength="120"
            />
          </UFormField>
          <UCheckbox
            v-if="deciding?.row.seriesId && !deciding.row.external"
            v-model="answer.whole"
            :label="t('spaces.requests.whole-series', { count: deciding.row.dates })"
            :description="t('spaces.requests.whole-series-help')"
          />
          <UFormField
            name="note"
            :label="t('spaces.requests.note')"
            :help="t('spaces.requests.note-help')"
            :required="deciding?.verb === 'decline'"
          >
            <UTextarea
              v-model="answer.note"
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
          form="spaces-decide"
          :color="deciding?.verb === 'decline' ? 'error' : 'primary'"
          :loading="formEl?.loading"
          :label="deciding?.verb === 'decline' ? t('spaces.requests.decline') : t('spaces.requests.confirm')"
        />
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('spaces.book.cancel')"
          @click="deciding = null"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
