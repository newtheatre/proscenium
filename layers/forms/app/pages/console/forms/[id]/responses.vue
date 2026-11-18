<!-- The responses to one form (FB-401, FB-402): a row per response and a column per question the
     form has ever had. The filters and the page live in the address, so a view can be sent to
     somebody else. A response opens beside the table; a restricted answer stays shut until somebody
     who may open it asks to, and each time is recorded. -->
<script setup lang="ts">
import { parseDate, toZoned } from '@internationalized/date'
import type { Definition } from '../../../../../shared/engine'
import type { ShownAnswer } from '../../../../components/FormsAnswers.vue'

interface Column { questionId: string, key: string, label: string, type: string, dataClass: string, retired: boolean }
interface Row { id: string, reference: string, version: number, who: string | null, submittedAt: number, cells: Record<string, { text: string, restricted: boolean }> }
interface Table {
  form: { id: string, title: string, slug: string, anonymous: boolean, status: string }
  columns: Column[]
  rows: Row[]
  total: number
  page: number
  pageSize: number
  canExport: boolean
  canReadSpecial: boolean
}
interface One { response: { id: string, reference: string, version: number, submittedAt: number, respondentEmail: string | null }, definition: Definition, answers: ShownAnswer[], restricted: boolean }

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
const view = computed(() => ({ page: Number(text(route.query.page)) || 1, from: text(route.query.from), to: text(route.query.to), question: text(route.query.question), value: text(route.query.value) }))
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
const filtered = computed(() => !!(view.value.from || view.value.to || view.value.question))

// Questions a response can be picked out by: an answer that is one value, and never a sealed one.
const pickable = computed(() => (data.value?.columns ?? []).filter(c => c.dataClass !== 'special' && !['text.long', 'address', 'file'].includes(c.type)))
const questionItems = computed(() => pickable.value.map(c => ({ value: c.questionId, label: c.label || c.key })))
const question = computed({ get: () => view.value.question, set: (id: string | undefined) => show({ question: id, value: undefined }) })
const typed = ref(view.value.value ?? '')
watch(() => view.value.value, (v) => { typed.value = v ?? '' })

const columns = computed(() => [
  { accessorKey: 'reference', header: t('forms.screens.responses.reference') },
  { accessorKey: 'sent', header: t('forms.screens.responses.sent') },
  ...(data.value?.form.anonymous ? [] : [{ accessorKey: 'who', header: t('forms.screens.responses.from') }]),
  ...(data.value?.columns ?? []).map(c => ({ accessorKey: `q:${c.questionId}`, header: c.retired ? t('forms.screens.responses.removed', { name: c.label || c.key }) : c.label || c.key })),
])
const rows = computed(() => (data.value?.rows ?? []).map(r => ({
  id: r.id,
  reference: r.reference,
  sent: dateTime(r.submittedAt),
  who: r.who ?? '',
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
async function load(reveal = false) {
  if (!openId.value) return
  opening.value = true
  try {
    one.value = await $api<One>(`/api/forms/forms/${formId.value}/responses/${openId.value}${reveal ? '?reveal=1' : ''}` as string)
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
  if (id) load()
}, { immediate: true })
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
          <FormsAnswers
            :definition="one.definition"
            :answers="one.answers"
          />
        </div>
        <UProgress
          v-else
          size="xs"
        />
      </template>
    </USlideover>
  </PageFrame>
</template>
