<!-- The night report from the floor (Front of house specification, part 5, "Live mode"; FH-31, FH-32):
     for someone leading, who did not come, what is still open, notes by topic, then sign off. The full
     report, with figures and addenda, is in the console. -->
<script setup lang="ts">
type Topic = 'audience' | 'building' | 'show' | 'staffing' | 'other'
interface Report {
  state: 'draft' | 'signed_off'
  unresolved: { people: { assignmentId: string, accountId: string, state: string, duty: string }[], openChecklists: string[], missingTimings: string[] } | null
  notes: { id: string, kind: 'note' | 'addendum', topic: Topic, body: string, authorId: string, at: number }[]
  names: Record<string, string>
  performance: { title: string, startsAt: number } | null
  can: { write: boolean, signOff: boolean }
}

const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const { time } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.performance))
const base = computed(() => `/api/front-of-house/performances/${encodeURIComponent(id.value)}/report`)
const { data, status, error, refresh } = await useAPI<Report>(() => base.value, { key: `front-of-house:report:${id.value}` })

const noShows = ref<string[]>([])
const note = ref({ topic: 'other' as Topic, body: '' })
const busy = ref<'note' | 'sign-off' | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const topics = computed(() => (['audience', 'building', 'show', 'staffing', 'other'] as const).map(value => ({ value, label: t(`front-of-house.report.topic.${value}`) })))

async function addNote() {
  refusal.value = null
  busy.value = 'note'
  try {
    await write(`${base.value}/notes`, { method: 'POST', body: { topic: note.value.topic, body: note.value.body.trim() } })
    toast.add({ title: t('front-of-house.report.note-added'), color: 'success' })
    note.value = { topic: 'other', body: '' }
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = null
  }
}
async function signOff() {
  refusal.value = null
  busy.value = 'sign-off'
  try {
    await write(`${base.value}/sign-off`, { method: 'POST', body: { noShows: noShows.value } })
    toast.add({ title: t('front-of-house.report.signed'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = null
  }
}
const context = computed(() => data.value?.performance ? [data.value.performance.title, time(data.value.performance.startsAt)].join(' · ') : undefined)
</script>

<template>
  <PageLive
    :title="t('front-of-house.live.night-report')"
    :context="context"
    :back="`/live/front-of-house/${encodeURIComponent(id)}`"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="mx-auto max-w-2xl space-y-8">
          <RefusalNotice :refusal="refusal" />
          <UAlert
            v-if="d.state === 'signed_off'"
            color="success"
            variant="subtle"
            icon="i-lucide-circle-check"
            :title="t('front-of-house.live.report-signed')"
            :description="t('front-of-house.live.report-signed-description')"
          />

          <template v-if="d.state === 'draft' && d.unresolved">
            <section
              v-if="d.unresolved.missingTimings.length || d.unresolved.openChecklists.length"
              aria-labelledby="fh-report-open"
              class="space-y-2"
            >
              <h2
                id="fh-report-open"
                class="text-lg font-semibold text-highlighted"
              >
                {{ t('front-of-house.live.still-open') }}
              </h2>
              <p
                v-if="d.unresolved.missingTimings.length"
                class="text-warning"
              >
                {{ t('front-of-house.report.missing-timings', { timings: d.unresolved.missingTimings.map(k => t(`front-of-house.timings.${k}`)).join(', ') }) }}
              </p>
              <p
                v-if="d.unresolved.openChecklists.length"
                class="text-warning"
              >
                {{ t('front-of-house.report.open-checklists', { count: d.unresolved.openChecklists.length }) }}
              </p>
            </section>

            <section
              v-if="d.can.signOff && d.unresolved.people.length"
              aria-labelledby="fh-report-people"
              class="space-y-2"
            >
              <h2
                id="fh-report-people"
                class="text-lg font-semibold text-highlighted"
              >
                {{ t('front-of-house.live.who-did-not-come') }}
              </h2>
              <UCheckboxGroup
                v-model="noShows"
                size="xl"
                variant="card"
                :legend="t('front-of-house.live.who-did-not-come-help')"
                :items="d.unresolved.people.map(p => ({ value: p.assignmentId, label: `${d.names[p.accountId] ?? ''} (${p.duty})` }))"
              />
            </section>
          </template>

          <section
            aria-labelledby="fh-report-notes"
            class="space-y-3"
          >
            <h2
              id="fh-report-notes"
              class="text-lg font-semibold text-highlighted"
            >
              {{ t('front-of-house.live.notes') }}
            </h2>
            <ul
              v-if="d.notes.length"
              class="space-y-2"
            >
              <li
                v-for="n in d.notes"
                :key="n.id"
                class="rounded-lg border border-default p-3"
              >
                <p class="text-sm text-muted">
                  {{ t(`front-of-house.report.topic.${n.topic}`) }} · {{ d.names[n.authorId] ?? '' }} · {{ time(n.at) }}
                </p>
                <p class="whitespace-pre-line">
                  {{ n.body }}
                </p>
              </li>
            </ul>
            <UForm
              v-if="d.state === 'draft' && d.can.write"
              :state="note"
              :validate="() => needs({ body: note.body })"
              class="space-y-3"
              novalidate
              @submit="addNote"
            >
              <UFormField
                name="topic"
                :label="t('front-of-house.report.topic-label')"
              >
                <USelect
                  v-model="note.topic"
                  :items="topics"
                  size="xl"
                />
              </UFormField>
              <UFormField
                name="body"
                :label="t('front-of-house.live.note')"
              >
                <UTextarea
                  v-model="note.body"
                  :maxlength="2000"
                  autoresize
                  size="xl"
                />
              </UFormField>
              <UButton
                type="submit"
                size="xl"
                color="neutral"
                variant="outline"
                icon="i-lucide-message-square-plus"
                :loading="busy === 'note'"
                :label="t('front-of-house.report.add-note')"
              />
            </UForm>
          </section>
        </div>
      </template>
    </DataBoundary>

    <template
      v-if="data?.state === 'draft' && data.can.signOff"
      #footer
    >
      <div class="mx-auto max-w-2xl">
        <UButton
          size="xl"
          block
          icon="i-lucide-signature"
          :loading="busy === 'sign-off'"
          :label="t('front-of-house.report.sign-off')"
          @click="signOff"
        />
      </div>
    </template>
  </PageLive>
</template>
