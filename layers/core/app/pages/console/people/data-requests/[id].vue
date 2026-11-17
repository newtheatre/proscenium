<!-- One data request (ID-35): who asked, how staff checked who they were, where it stands and what
     holds it, and the tables to search by hand. Staff cancel it before it runs, tick each table, and
     close it once it has run. The server says which of those the viewer may do now. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { RefusalView } from '../../../../utils/refusal'

definePageMeta({ layout: 'console' })

type State = 'requested' | 'confirmed' | 'held' | 'running' | 'done' | 'cancelled' | 'failed'
type Outcome = 'nothing-found' | 'handled'
interface Request {
  id: string
  accountId: string
  person: string
  kind: 'export' | 'erasure'
  state: State
  requestedAt: number
  requestedBy: string | null
  identityCheck: string | null
  respondBy: number
  overdue: boolean
  notBefore: number | null
  holds: string[]
  finishedAt: number | null
  closedAt: number | null
  closedBy: string | null
}
interface Line { table: string, module: string, outcome: Outcome | null, tickedAt: number | null }
interface Answer { request: Request, checklist: Line[], actions: { cancel: boolean, tick: boolean, close: boolean } }

const { t, te } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { day, dateTime } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))

const { data, status, error, refresh } = await useAPI<Answer>(() => `/api/core/data-requests/${encodeURIComponent(id.value)}`, { key: `core:data-request:${id.value}` })

const TONES = { requested: 'neutral', confirmed: 'info', held: 'warning', running: 'info', done: 'success', cancelled: 'neutral', failed: 'danger' } as const
const kind = computed(() => data.value ? t(`core.data-requests.kind.${data.value.request.kind}`) : '')
const title = computed(() => data.value ? t('core.data-request.title', { kind: kind.value, person: data.value.request.person }) : '')
const holdText = (code: string) => te(`${code}.staff`) ? t(`${code}.staff`) : code
const finished = computed(() => ['done', 'cancelled'].includes(data.value?.request.state ?? ''))

const refusal = ref<RefusalView | null>(null)
/** One of this request's action routes. The path is built at run time, so it is a plain string. */
const at = (action: string): string => `/api/core/data-requests/${encodeURIComponent(id.value)}${action}`
async function act(run: () => Promise<unknown>, done: string) {
  refusal.value = null
  try {
    await run()
    toast.add({ title: done, color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function cancel() {
  const r = data.value!.request
  if (!await confirm({ verb: t('core.data-request.cancel.verb'), thing: t(`core.data-request.thing.${r.kind}`, { person: r.person }), consequence: t('core.data-request.cancel.consequence'), button: t('core.data-request.cancel.button') })) return
  await act(() => $api<unknown>(at(''), { method: 'DELETE', body: {} }), t('core.data-request.cancel.done'))
}
async function close() {
  const r = data.value!.request
  if (!await confirm({ verb: t('core.data-request.close.verb'), thing: t(`core.data-request.thing.${r.kind}`, { person: r.person }), consequence: t('core.data-request.close.consequence'), button: t('core.data-request.close.button') })) return
  await act(() => $api<unknown>(at('/close'), { method: 'POST', body: {} }), t('core.data-request.close.done'))
}
async function tick(line: Line, outcome: Outcome) {
  await act(() => $api<unknown>(at('/checks'), { method: 'PUT', body: { table: line.table, outcome } }), t('core.data-request.checklist.saved', { table: line.table }))
}

const actions = computed<DropdownMenuItem[][]>(() => {
  const a = data.value?.actions
  if (!a) return []
  const groups: DropdownMenuItem[][] = []
  if (a.close) groups.push([{ label: t('core.data-request.close.button'), icon: 'i-lucide-archive', onSelect: () => { void close() } }])
  if (a.cancel) groups.push([{ label: t('core.data-request.cancel.button'), icon: 'i-lucide-circle-x', color: 'error', onSelect: () => { void cancel() } }])
  return groups
})

const summary = computed(() => {
  const r = data.value?.request
  if (!r) return []
  return [
    { label: t('core.data-request.asked'), value: day(r.requestedAt) },
    { label: t('core.data-request.asked-by'), value: r.requestedBy ?? t('core.data-request.themselves') },
    ...(r.identityCheck ? [{ label: t('core.data-request.identity-check'), value: t(`core.data-request.identity-checks.${r.identityCheck}`) }] : []),
    { label: t('core.data-request.respond-by'), value: day(r.respondBy) },
    ...(r.notBefore && !r.finishedAt ? [{ label: t('core.data-request.not-before'), value: dateTime(r.notBefore) }] : []),
    ...(r.finishedAt ? [{ label: t('core.data-request.finished'), value: day(r.finishedAt) }] : []),
  ]
})
const trail = computed(() => [{ label: t('core.navigation.data-requests.label'), to: '/console/people/data-requests' }])
const OUTCOMES: Outcome[] = ['nothing-found', 'handled']
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageRecord
        :title="title"
        :status="d.request.closedAt ? { label: t('core.data-requests.state.closed'), tone: 'neutral' } : { label: t(`core.data-requests.state.${d.request.state}`), tone: TONES[d.request.state as State] }"
        :actions="actions"
        :summary="summary"
        record-type="core.data-request"
        :record-id="d.request.id"
        :tabs="[{ id: 'overview', label: t('core.data-request.overview') }]"
        :trail="trail"
      >
        <template #aside>
          <PageSection :title="t('core.data-requests.column.person')">
            <ULink
              :to="`/console/people/${encodeURIComponent(d.request.accountId)}`"
              class="text-sm"
            >
              {{ t('core.data-request.person') }}
            </ULink>
          </PageSection>
        </template>

        <template #tab-overview>
          <div class="space-y-6">
            <RefusalNotice :refusal="refusal" />
            <UAlert
              v-if="d.request.overdue"
              color="error"
              variant="subtle"
              icon="i-lucide-clock-alert"
              :title="t('core.data-request.overdue')"
            />
            <UAlert
              v-if="d.request.closedAt"
              color="neutral"
              variant="subtle"
              icon="i-lucide-archive"
              :title="t('core.data-request.closed', { day: day(d.request.closedAt), person: d.request.closedBy ?? '' })"
            />

            <PageSection
              v-if="d.request.state === 'held' && d.request.holds.length"
              :title="t('core.data-request.held')"
            >
              <ul class="list-disc space-y-1 ps-5 text-sm">
                <li
                  v-for="code in d.request.holds"
                  :key="code"
                >
                  {{ holdText(code) }}
                </li>
              </ul>
            </PageSection>

            <PageSection
              v-if="d.request.state !== 'cancelled'"
              :title="t('core.data-request.checklist.title')"
              :description="t('core.data-request.checklist.description')"
            >
              <p
                v-if="!d.checklist.length"
                class="text-sm text-muted"
              >
                {{ t('core.data-request.checklist.none') }}
              </p>
              <template v-else>
                <p
                  v-if="!finished"
                  class="mb-3 text-sm text-muted"
                >
                  {{ t('core.data-request.checklist.waiting') }}
                </p>
                <ul class="divide-y divide-default">
                  <li
                    v-for="line in d.checklist"
                    :key="line.table"
                    class="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div class="min-w-0">
                      <p class="font-mono text-sm break-all">
                        {{ line.table }}
                      </p>
                      <p class="text-xs text-muted">
                        {{ t(`${line.module}.module.name`) }}<template v-if="line.tickedAt">
                          · {{ t('core.data-request.checklist.ticked', { when: dateTime(line.tickedAt) }) }}
                        </template>
                      </p>
                    </div>
                    <URadioGroup
                      :model-value="line.outcome ?? undefined"
                      orientation="horizontal"
                      :disabled="!d.actions.tick"
                      :aria-label="t('core.data-request.checklist.outcome', { table: line.table })"
                      :items="OUTCOMES.map(o => ({ value: o, label: t(`core.data-request.checklist.${o}`) }))"
                      @update:model-value="(o: unknown) => tick(line, o as Outcome)"
                    />
                  </li>
                </ul>
              </template>
            </PageSection>
          </div>
        </template>
      </PageRecord>
    </template>
  </DataBoundary>
</template>
