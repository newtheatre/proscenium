<!-- One night report (Front of house specification, part 5, "Night report"): timings, figures by
     section, people by duty, checklists with exceptions, incidents by number, notes and addenda. While
     a draft it is "Sign off", which first asks who did not come; after, "Add addendum". The address
     names the performance. -->
<script setup lang="ts">
type Topic = 'audience' | 'building' | 'show' | 'staffing' | 'other'
interface Snapshot {
  timings: { kind: string, at: number }[]
  duties: { dutyId: string, duty: string, worked: number, noShows: number }[]
  checklists: { checklistId: string, name: string, state: string, exceptions: { item: string, reasonCode: string | null }[] }[]
  incidents: { id: string, reference: string, kind: string, severity: string }[]
  sections: { id: string, label: string, lines: { label: string, value: string | number, unit?: string }[] | null }[]
}
interface Report {
  id: string | null
  state: 'draft' | 'signed_off'
  signedOffBy: string | null
  signedOffAt: number | null
  report: Snapshot
  unresolved: { people: { assignmentId: string, accountId: string, state: string, duty: string }[], openChecklists: string[], missingTimings: string[] } | null
  notes: { id: string, kind: 'note' | 'addendum', topic: Topic, body: string, authorId: string, at: number }[]
  names: Record<string, string>
  performance: { title: string, startsAt: number } | null
  can: { write: boolean, signOff: boolean }
}

const { t, te } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const { dateTime, time } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<Report>(() => `/api/front-of-house/performances/${encodeURIComponent(id.value)}/report`, { key: `front-of-house:report:${id.value}` })

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const dialog = ref<'note' | 'sign-off' | null>(null)
const noteForm = ref({ topic: 'other' as Topic, body: '' })
const noShows = ref<string[]>([])
const topics = computed(() => (['audience', 'building', 'show', 'staffing', 'other'] as const).map(value => ({ value, label: t(`front-of-house.report.topic.${value}`) })))
const base = computed(() => `/api/front-of-house/performances/${encodeURIComponent(id.value)}/report`)

async function submit() {
  refusal.value = null
  try {
    if (dialog.value === 'note') {
      await write(`${base.value}/notes`, { method: 'POST', body: { topic: noteForm.value.topic, body: noteForm.value.body.trim() } })
      toast.add({ title: t(data.value?.state === 'signed_off' ? 'front-of-house.report.addendum-added' : 'front-of-house.report.note-added'), color: 'success' })
    }
    else {
      await write(`${base.value}/sign-off`, { method: 'POST', body: { noShows: noShows.value } })
      toast.add({ title: t('front-of-house.report.signed'), color: 'success' })
    }
    dialog.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
function open(which: 'note' | 'sign-off') {
  refusal.value = null
  noteForm.value = { topic: 'other', body: '' }
  noShows.value = []
  dialog.value = which
}

const primary = computed(() => {
  const d = data.value
  if (!d) return undefined
  if (d.state === 'draft' && d.can.signOff) return { label: t('front-of-house.report.sign-off'), icon: 'i-lucide-signature' }
  if (d.state === 'signed_off' && d.can.write) return { label: t('front-of-house.report.add-addendum'), icon: 'i-lucide-file-plus' }
  return undefined
})
const summary = computed(() => {
  const d = data.value
  if (!d) return []
  const timing = (kind: string) => d.report.timings.find(x => x.kind === kind)
  return [
    ...(d.performance ? [{ label: t('front-of-house.report.performance'), value: dateTime(d.performance.startsAt) }] : []),
    ...(['house_open', 'curtain_up', 'curtain_down'] as const).map(kind => ({ label: t(`front-of-house.timings.${kind}`), value: timing(kind) ? time(timing(kind)!.at) : t('front-of-house.report.not-recorded') })),
    ...(d.signedOffBy ? [{ label: t('front-of-house.report.signed-off-by'), value: d.names[d.signedOffBy] ?? '' }] : []),
  ]
})
const reason = (code: string | null) => code ? (te(code) ? t(code) : code) : t('front-of-house.report.no-reason')
const figure = useFigureValue()
const trail = computed(() => [{ label: t('front-of-house.navigation.night-reports.label'), to: '/console/front-of-house/night-reports' }])
const title = computed(() => data.value?.performance ? t('front-of-house.report.title', { show: data.value.performance.title }) : t('front-of-house.navigation.night-reports.label'))
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageFrame
        :title="title"
        :trail="trail"
      >
        <template #status>
          <StatusBadge
            :tone="d.state === 'signed_off' ? 'success' : 'warning'"
            :label="t(`front-of-house.report-states.${d.state}`)"
          />
        </template>
        <template #primary>
          <div class="flex gap-2">
            <UButton
              v-if="d.state === 'draft' && d.can.write"
              color="neutral"
              variant="outline"
              icon="i-lucide-message-square-plus"
              :label="t('front-of-house.report.add-note')"
              @click="open('note')"
            />
            <UButton
              v-if="primary"
              :icon="primary.icon"
              :label="primary.label"
              @click="open(d.state === 'draft' ? 'sign-off' : 'note')"
            />
          </div>
        </template>
        <div class="space-y-6">
          <RefusalNotice :refusal="refusal" />
          <FactStrip :facts="summary" />
          <PageSection
            v-for="section in d.report.sections"
            :key="section.id"
            :title="section.label"
          >
            <FactStrip
              v-if="section.lines"
              :facts="section.lines.map(l => ({ label: figure.label(l.label), value: figure.value(l.value, l.unit) }))"
            />
            <p
              v-else
              class="text-muted"
            >
              {{ t('front-of-house.report.section-unavailable') }}
            </p>
          </PageSection>
          <PageSection :title="t('front-of-house.report.people')">
            <p
              v-if="!d.report.duties.length"
              class="text-muted"
            >
              {{ t('front-of-house.report.no-people') }}
            </p>
            <RecordList
              v-else
              :label="t('front-of-house.report.people')"
            >
              <RecordListItem
                v-for="duty in d.report.duties"
                :key="duty.dutyId"
                icon="i-lucide-users"
                :name="duty.duty"
                :description="t('front-of-house.report.duty-line', { worked: duty.worked, noShows: duty.noShows })"
              />
            </RecordList>
          </PageSection>
          <PageSection
            v-if="d.report.checklists.length"
            :title="t('front-of-house.report.checklists')"
          >
            <RecordList :label="t('front-of-house.report.checklists')">
              <RecordListItem
                v-for="c in d.report.checklists"
                :key="c.checklistId"
                icon="i-lucide-list-checks"
                :name="c.name"
                :description="c.exceptions.map(x => `${x.item}: ${reason(x.reasonCode)}`).join(' · ')"
              >
                <StatusBadge
                  :tone="c.exceptions.length ? 'warning' : c.state === 'open' ? 'info' : 'success'"
                  :label="t(`front-of-house.run-states.${c.state}`)"
                />
              </RecordListItem>
            </RecordList>
          </PageSection>
          <PageSection
            v-if="d.report.incidents.length"
            :title="t('front-of-house.report.incidents')"
          >
            <RecordList :label="t('front-of-house.report.incidents')">
              <RecordListItem
                v-for="i in d.report.incidents"
                :key="i.id"
                :to="`/console/front-of-house/incidents/${encodeURIComponent(i.id)}`"
                icon="i-lucide-shield-alert"
                :name="i.reference"
                :description="`${t(`front-of-house.incident-kinds.${i.kind}`)} · ${t(`front-of-house.severities.${i.severity}`)}`"
              />
            </RecordList>
          </PageSection>
          <PageSection :title="t('front-of-house.report.notes')">
            <p
              v-if="!d.notes.length"
              class="text-muted"
            >
              {{ t('front-of-house.report.no-notes') }}
            </p>
            <RecordList
              v-else
              :label="t('front-of-house.report.notes')"
            >
              <RecordListItem
                v-for="n in d.notes"
                :key="n.id"
                :icon="n.kind === 'addendum' ? 'i-lucide-file-plus' : 'i-lucide-message-square'"
                :name="`${t(`front-of-house.report.topic.${n.topic}`)}${n.kind === 'addendum' ? ` (${t('front-of-house.report.addendum')})` : ''}`"
                :description="`${d.names[n.authorId] ?? ''} · ${dateTime(n.at)}`"
              >
                <template #below>
                  <p class="whitespace-pre-line text-sm">
                    {{ n.body }}
                  </p>
                </template>
              </RecordListItem>
            </RecordList>
          </PageSection>
        </div>
      </PageFrame>

      <UModal
        :open="dialog !== null"
        :title="dialog === 'sign-off' ? t('front-of-house.report.sign-off') : d.state === 'signed_off' ? t('front-of-house.report.add-addendum') : t('front-of-house.report.add-note')"
        @update:open="v => { if (!v) dialog = null }"
      >
        <template #body>
          <UForm
            id="front-of-house-report-dialog"
            class="space-y-4"
            :state="{ noteForm, noShows }"
            @submit="submit"
          >
            <RefusalNotice :refusal="refusal" />
            <template v-if="dialog === 'note'">
              <UFormField :label="t('front-of-house.report.topic-label')">
                <USelect
                  v-model="noteForm.topic"
                  :items="topics"
                  value-key="value"
                />
              </UFormField>
              <UFormField
                :label="t('front-of-house.report.note-body')"
                required
              >
                <UTextarea
                  v-model="noteForm.body"
                  :rows="4"
                  maxlength="2000"
                />
              </UFormField>
            </template>
            <template v-else-if="d.unresolved">
              <p
                v-if="d.unresolved.missingTimings.length"
                class="text-sm"
              >
                {{ t('front-of-house.report.missing-timings', { timings: d.unresolved.missingTimings.map(k => t(`front-of-house.timings.${k}`)).join(', ') }) }}
              </p>
              <p
                v-if="d.unresolved.openChecklists.length"
                class="text-sm"
              >
                {{ t('front-of-house.report.open-checklists', { count: d.unresolved.openChecklists.length }) }}
              </p>
              <UCheckboxGroup
                v-if="d.unresolved.people.length"
                v-model="noShows"
                :legend="t('front-of-house.report.no-shows')"
                :description="t('front-of-house.report.no-shows-help')"
                :items="d.unresolved.people.map(p => ({ value: p.assignmentId, label: `${d.names[p.accountId] ?? ''} (${p.duty})` }))"
              />
            </template>
          </UForm>
        </template>
        <template #footer>
          <UButton
            type="submit"
            form="front-of-house-report-dialog"
            :label="dialog === 'sign-off' ? t('front-of-house.report.sign-off') : t('front-of-house.save')"
            :disabled="dialog === 'note' && !noteForm.body.trim()"
          />
        </template>
      </UModal>
    </template>
  </DataBoundary>
</template>
