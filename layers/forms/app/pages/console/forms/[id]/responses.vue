<!-- The responses to one form (FB-401, FB-402): a row per response and a column per question the
     form has ever had. The filters and the page live in the address, so a view can be sent to
     somebody else. A response opens beside the table; a restricted answer stays shut until somebody
     who may open it asks to, and each time is recorded. -->
<script setup lang="ts">
import { parseDate, toZoned } from '@internationalized/date'
import type { ReviewResult } from '../../../../components/FormsReviewResult.vue'
import type { Definition } from '../../../../../shared/engine'
import type { ShownAnswer } from '../../../../components/FormsAnswers.vue'

interface Column { questionId: string, key: string, label: string, type: string, dataClass: string, retired: boolean }
interface Stage { key: string, name: string, kind: string }
interface Row { id: string, reference: string, version: number, who: string | null, submittedAt: number, stage: { name: string, kind: string } | null, cells: Record<string, { text: string, restricted: boolean }> }
interface Table {
  form: { id: string, title: string, slug: string, anonymous: boolean, status: string }
  columns: Column[]
  rows: Row[]
  stages: Stage[]
  total: number
  page: number
  pageSize: number
  canExport: boolean
  canReadSpecial: boolean
}
interface Move { key: string, label: string, to: string, toKind: string, decision: boolean, needsReason: boolean }
interface One {
  response: { id: string, reference: string, version: number, submittedAt: number, respondentEmail: string | null }
  definition: Definition
  answers: ShownAnswer[]
  restricted: boolean
  revision: number
  revisions: number
  changed: string[]
  stage: (Stage & { note: string | null }) | null
  moves: Move[]
  history: { at: number, from: string | null, to: string, toKind: string, move: string, revision: number, by: string | null }[]
  review: (ReviewResult & { stage: string, mode: 'scores' | 'vote', open: boolean, released: boolean, conflicted: number, canRelease: boolean }) | null
  decision: { at: number, reason: string | null } | null
  about: { slot: string, label: string, name: string | null } | null
  actions: { id: string, action: string, label: string | null, state: 'waiting' | 'done' | 'skipped' | 'failed', detail: string | null, at: number, canRunAgain: boolean }[]
}

definePageMeta({ layout: 'console' })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { dateTime, zone } = useDates()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const formId = computed(() => String(route.params.id))

// ---- the view, from the address ----
const text = (v: unknown) => typeof v === 'string' && v ? v : undefined
const view = computed(() => ({ page: Number(text(route.query.page)) || 1, from: text(route.query.from), to: text(route.query.to), question: text(route.query.question), value: text(route.query.value), stage: text(route.query.stage) }))
// The address holds days; the server takes instants, so a day becomes its start in the theatre's time zone.
function instant(day: string | undefined, add = 0) {
  try { return day ? toZoned(parseDate(day).add({ days: add }), zone.value).toDate().getTime() : undefined }
  catch { return undefined }
}
const asked = computed(() => ({ ...view.value, from: instant(view.value.from), to: instant(view.value.to, 1) }))
const query = computed(() => Object.fromEntries(Object.entries(asked.value).filter(([k, v]) => v !== undefined && !(k === 'page' && v === 1))))
const { data, status, error, refresh } = await useAPI<Table>(() => `/api/forms/forms/${formId.value}/responses`, { query, key: () => `forms:responses:${formId.value}:${JSON.stringify(query.value)}` })
function show(change: Record<string, string | number | undefined>) {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...view.value, page: 1, ...change, open: undefined })) if (v !== undefined && v !== '' && !(k === 'page' && v === 1)) next[k] = String(v)
  router.replace({ query: next })
}
const page = computed({ get: () => view.value.page, set: (p: number) => show({ page: p }) })
const from = computed({ get: () => view.value.from ?? '', set: (day: string | null) => show({ from: day || undefined }) })
const to = computed({ get: () => view.value.to ?? '', set: (day: string | null) => show({ to: day || undefined }) })
const filtered = computed(() => !!(view.value.from || view.value.to || view.value.question || view.value.stage))
const stage = computed({ get: () => view.value.stage, set: (key: string | undefined) => show({ stage: key }) })
const stageItems = computed(() => (data.value?.stages ?? []).map(s => ({ value: s.key, label: s.name })))

// Questions a response can be picked out by: an answer that is one value, and never a sealed one.
const pickable = computed(() => (data.value?.columns ?? []).filter(c => c.dataClass !== 'special' && !['text.long', 'address', 'file'].includes(c.type)))
const questionItems = computed(() => pickable.value.map(c => ({ value: c.questionId, label: c.label || c.key })))
const question = computed({ get: () => view.value.question, set: (id: string | undefined) => show({ question: id, value: undefined }) })
const typed = ref(view.value.value ?? '')
watch(() => view.value.value, (v) => { typed.value = v ?? '' })

const columns = computed(() => [
  { accessorKey: 'reference', header: t('forms.screens.responses.reference') },
  { accessorKey: 'sent', header: t('forms.screens.responses.sent') },
  ...(data.value?.stages.length ? [{ accessorKey: 'stage', header: t('forms.screens.responses.stage') }] : []),
  ...(data.value?.form.anonymous ? [] : [{ accessorKey: 'who', header: t('forms.screens.responses.from') }]),
  ...(data.value?.columns ?? []).map(c => ({ accessorKey: `q:${c.questionId}`, header: c.retired ? t('forms.screens.responses.removed', { name: c.label || c.key }) : c.label || c.key })),
])
const rows = computed(() => (data.value?.rows ?? []).map(r => ({
  id: r.id,
  reference: r.reference,
  sent: dateTime(r.submittedAt),
  who: r.who ?? '',
  stage: r.stage,
  ...Object.fromEntries((data.value?.columns ?? []).map(c => [`q:${c.questionId}`, r.cells[c.questionId]?.restricted ? t('forms.screens.answers.restricted') : r.cells[c.questionId]?.text ?? ''])),
})))
const exportUrl = computed(() => {
  const params = new URLSearchParams(Object.entries(query.value).filter(([k]) => k !== 'page').map(([k, v]) => [k, String(v)]))
  return `/api/forms/forms/${formId.value}/responses/export${params.size ? `?${params}` : ''}`
})

// ---- one response, beside the table ----
const openId = computed(() => text(route.query.open))
const one = ref<One | null>(null)
const opening = ref(false)
const revealed = ref(false)
async function load(reveal = revealed.value, revision?: number) {
  if (!openId.value) return
  opening.value = true
  try {
    const ask = new URLSearchParams({ ...(reveal ? { reveal: '1' } : {}), ...(revision ? { revision: String(revision) } : {}) })
    one.value = await $api<One>(`/api/forms/forms/${formId.value}/responses/${openId.value}${ask.size ? `?${ask}` : ''}` as string)
    revealed.value = reveal
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
    if (!reveal) close()
  }
  opening.value = false
}
watch(openId, (id) => {
  one.value = null
  revealed.value = false
  if (id) load(false)
}, { immediate: true })
const revisionItems = computed(() => Array.from({ length: one.value?.revisions ?? 0 }, (_, i) => ({ value: i + 1, label: t(i + 1 === one.value!.revisions ? 'forms.screens.responses.revision-latest' : 'forms.screens.responses.revision-n', { n: i + 1 }) })).reverse())
const revision = computed({ get: () => one.value?.revision, set: (n: number | undefined) => { load(revealed.value, n) } })

// ---- what other modules were asked to do ----
async function runAgain(runId: string) {
  if (!one.value) return
  try {
    await $api(`/api/forms/forms/${formId.value}/responses/${one.value.response.id}/actions/${runId}/run` as string, { method: 'POST', body: {} })
    toast.add({ title: t('forms.screens.actions.queued'), color: 'success' })
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
  await load()
}
const runTone = { waiting: 'info', done: 'success', skipped: 'neutral', failed: 'danger' } as const

// ---- releasing its reviews to the panel ----
const releasing = ref(false)
async function release() {
  if (!one.value) return
  releasing.value = true
  try {
    await $api(`/api/forms/forms/${formId.value}/responses/${one.value.response.id}/release` as string, { method: 'POST' })
    toast.add({ title: t('forms.screens.review.released'), color: 'success' })
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
  releasing.value = false
  await load()
}

// ---- moving it to another stage ----
const moving = ref<Move | null>(null)
const note = ref('')
const sending = ref(false)
const moveOpen = computed({ get: () => !!moving.value, set: (v: boolean) => { if (!v) moving.value = null } })
const reason = ref('')
const reasonError = ref<string | undefined>()
function choose(move: Move) {
  note.value = ''
  reason.value = ''
  reasonError.value = undefined
  moving.value = move
}
async function move() {
  if (!moving.value || !one.value) return
  // A decision that must carry a reason says so beside the box, and nothing is sent without one.
  reasonError.value = moving.value.needsReason && !reason.value.trim() ? t('forms.screens.responses.reason-needed') : undefined
  if (reasonError.value) return
  sending.value = true
  try {
    await $api(`/api/forms/forms/${formId.value}/responses/${one.value.response.id}/move` as string, { method: 'POST', body: { move: moving.value.key, note: note.value.trim() || null, reason: reason.value.trim() || null } })
    toast.add({ title: t('forms.screens.responses.moved', { reference: one.value.response.reference, stage: moving.value.to }), color: 'success' })
    moving.value = null
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
    moving.value = null
  }
  sending.value = false
  await Promise.all([load(), refresh()])
}
const open = (id: string) => router.replace({ query: { ...route.query, open: id } })
const close = () => router.replace({ query: { ...route.query, open: undefined } })
const panel = computed({ get: () => !!openId.value, set: (v: boolean) => { if (!v) close() } })
</script>

<template>
  <PageFrame
    :title="t('forms.screens.responses.title')"
    :description="data ? t('forms.screens.responses.count', { count: data.total }) : undefined"
    width="full"
    :trail="[{ label: t('forms.navigation.forms.label'), to: '/console/forms' }, ...(data ? [{ label: data.form.title, to: `/console/forms/${formId}` }] : [])]"
  >
    <template
      v-if="data?.canExport"
      #primary
    >
      <UButton
        :label="t('forms.screens.responses.export')"
        icon="i-lucide-download"
        color="neutral"
        variant="outline"
        :to="exportUrl"
        external
        target="_blank"
      />
    </template>
    <template #toolbar>
      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="t('forms.screens.responses.from-date')">
          <FieldDate v-model="from" />
        </UFormField>
        <UFormField :label="t('forms.screens.responses.to-date')">
          <FieldDate v-model="to" />
        </UFormField>
        <UFormField
          v-if="stageItems.length"
          :label="t('forms.screens.responses.stage')"
        >
          <USelect
            v-model="stage"
            :items="stageItems"
            :placeholder="t('forms.screens.responses.any-stage')"
            class="min-w-40"
          />
        </UFormField>
        <UFormField :label="t('forms.screens.responses.where')">
          <USelect
            v-model="question"
            :items="questionItems"
            :placeholder="t('forms.screens.responses.any-answer')"
            class="min-w-48"
          />
        </UFormField>
        <UFormField
          v-if="view.question"
          :label="t('forms.screens.responses.is')"
        >
          <UInput
            v-model="typed"
            @change="show({ value: typed.trim() || undefined })"
          />
        </UFormField>
        <UButton
          v-if="filtered"
          :label="t('forms.screens.responses.clear')"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          @click="router.replace({ query: {} })"
        />
      </div>
    </template>

    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.rows.length"
        icon="i-lucide-inbox"
        :title="filtered ? t('forms.screens.responses.none-match') : t('forms.screens.responses.none')"
        :description="filtered ? undefined : t('forms.screens.responses.none-help')"
      />
      <div
        v-else
        class="space-y-4"
      >
        <UTable
          :data="rows"
          :columns="columns"
          :caption="t('forms.screens.responses.title')"
          :ui="{ td: 'max-w-64 truncate', th: 'max-w-64 truncate' }"
        >
          <template #reference-cell="{ row }">
            <UButton
              :label="row.original.reference"
              variant="link"
              class="p-0 font-mono"
              :aria-label="t('forms.screens.responses.open', { reference: row.original.reference })"
              @click="open(row.original.id)"
            />
          </template>
          <template #stage-cell="{ row }">
            <StatusBadge
              v-if="row.original.stage"
              :tone="formsStageTone(row.original.stage.kind)"
              :label="row.original.stage.name"
            />
          </template>
        </UTable>
        <UPagination
          v-if="data.total > data.pageSize"
          v-model:page="page"
          :total="data.total"
          :items-per-page="data.pageSize"
        />
      </div>
    </DataBoundary>

    <USlideover
      v-model:open="panel"
      :title="one ? t('forms.screens.responses.one', { reference: one.response.reference }) : t('forms.screens.responses.title')"
      :description="one ? t('forms.screens.responses.one-sent', { when: dateTime(one.response.submittedAt), n: one.response.version }) : undefined"
    >
      <template #body>
        <div
          v-if="one"
          class="space-y-4"
        >
          <UAlert
            v-if="one.restricted"
            color="neutral"
            variant="subtle"
            icon="i-lucide-lock"
            :title="t('forms.screens.responses.restricted-title')"
            :description="data?.canReadSpecial ? t('forms.screens.responses.restricted-open') : t('forms.screens.responses.restricted-shut')"
            :actions="data?.canReadSpecial ? [{ label: t('forms.screens.responses.reveal'), color: 'neutral', variant: 'outline', loading: opening, onClick: () => { load(true) } }] : undefined"
          />
          <p
            v-if="one.about"
            class="text-sm"
          >
            <span class="font-medium">{{ t(one.about.label) }}</span>
            <template v-if="one.about.name">
              {{ ' ' }}{{ one.about.name }}
            </template>
          </p>
          <section
            v-if="one.stage"
            class="space-y-3"
            :aria-label="t('forms.screens.responses.stage')"
          >
            <div class="flex flex-wrap items-center gap-2">
              <StatusBadge
                :tone="formsStageTone(one.stage.kind)"
                :label="one.stage.name"
              />
              <UButton
                v-for="m in one.moves"
                :key="m.key"
                :label="m.label"
                size="sm"
                color="neutral"
                variant="outline"
                @click="choose(m)"
              />
            </div>
            <p
              v-if="one.stage.note"
              class="text-sm text-muted"
            >
              {{ t('forms.screens.responses.note-sent', { note: one.stage.note }) }}
            </p>
          </section>
          <section
            v-if="one.review"
            class="space-y-3 rounded-md border border-default p-3"
            :aria-label="t('forms.screens.review.title')"
          >
            <h3 class="text-sm font-medium text-muted">
              {{ t('forms.screens.review.in-stage', { stage: one.review.stage }) }}
            </h3>
            <FormsReviewResult
              :result="one.review"
              :mode="one.review.mode"
              :released="one.review.released"
            />
            <p
              v-if="one.review.conflicted"
              class="text-sm text-muted"
            >
              {{ t('forms.screens.review.conflicts', { n: one.review.conflicted }) }}
            </p>
            <UButton
              v-if="one.review.canRelease"
              :label="t('forms.screens.review.release')"
              icon="i-lucide-eye"
              size="sm"
              color="neutral"
              variant="outline"
              :loading="releasing"
              @click="release"
            />
          </section>
          <p
            v-if="one.decision?.reason"
            class="text-sm"
          >
            <span class="font-medium">{{ t('forms.screens.responses.reason-kept') }}</span>
            {{ one.decision.reason }}
          </p>
          <section
            v-if="one.actions.length"
            class="space-y-2"
          >
            <h3 class="text-sm font-medium text-muted">
              {{ t('forms.screens.actions.title') }}
            </h3>
            <ul class="space-y-2 text-sm">
              <li
                v-for="run in one.actions"
                :key="run.id"
                class="space-y-1"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium">{{ run.label ? t(run.label) : run.action }}</span>
                  <StatusBadge
                    :tone="runTone[run.state]"
                    :label="t(`forms.screens.actions.state.${run.state}`)"
                  />
                  <UButton
                    v-if="run.canRunAgain"
                    color="neutral"
                    variant="outline"
                    size="xs"
                    :label="t('forms.screens.actions.run-again')"
                    @click="runAgain(run.id)"
                  />
                </div>
                <span
                  v-if="run.state === 'failed' && run.detail"
                  class="block text-muted"
                >{{ run.detail }}</span>
                <span
                  v-else-if="run.state === 'skipped'"
                  class="block text-muted"
                >{{ t('forms.screens.actions.skipped-slot') }}</span>
              </li>
            </ul>
          </section>
          <UFormField
            v-if="one.revisions > 1"
            :label="t('forms.screens.responses.revision')"
            :help="one.revision > 1 ? t('forms.screens.responses.revision-help') : undefined"
          >
            <USelect
              v-model="revision"
              :items="revisionItems"
              class="min-w-48"
            />
          </UFormField>
          <FormsAnswers
            :definition="one.definition"
            :answers="one.answers"
            :changed="one.changed"
          />
          <section
            v-if="one.history.length"
            class="space-y-2"
          >
            <h3 class="text-sm font-medium text-muted">
              {{ t('forms.screens.responses.history') }}
            </h3>
            <ol class="space-y-1 text-sm">
              <li
                v-for="(h, i) in one.history"
                :key="i"
              >
                <span class="block font-medium">{{ h.from === null ? t('forms.screens.responses.arrived', { stage: h.to }) : t('forms.screens.responses.went', { move: h.move, stage: h.to }) }}</span>
                <span class="block text-muted">{{ h.by ? t('forms.screens.responses.by-at', { who: h.by, when: dateTime(h.at) }) : dateTime(h.at) }}</span>
              </li>
            </ol>
          </section>
        </div>
        <UProgress
          v-else
          size="xs"
        />
      </template>
    </USlideover>

    <UModal
      v-model:open="moveOpen"
      :title="moving?.label"
      :description="moving ? t('forms.screens.responses.move-help', { stage: moving.to }) : undefined"
    >
      <template #body>
        <UFormField
          v-if="moving?.decision"
          class="mb-4"
          :label="t('forms.screens.responses.reason')"
          :help="t('forms.screens.responses.reason-help')"
          :hint="moving.needsReason ? undefined : t('forms.screens.details.optional')"
          :error="reasonError"
        >
          <UTextarea
            v-model="reason"
            :rows="3"
            autoresize
          />
        </UFormField>
        <UFormField
          :label="t('forms.screens.responses.note')"
          :help="t('forms.screens.responses.note-help')"
          :hint="t('forms.screens.details.optional')"
        >
          <UTextarea
            v-model="note"
            :rows="4"
            autoresize
          />
        </UFormField>
      </template>
      <template #footer>
        <UButton
          :label="t('forms.screens.publish.cancel')"
          color="neutral"
          variant="ghost"
          @click="moving = null"
        />
        <UButton
          :label="moving?.label"
          :loading="sending"
          @click="move"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
