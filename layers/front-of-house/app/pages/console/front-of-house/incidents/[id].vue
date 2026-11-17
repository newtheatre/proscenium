<!-- One incident (Front of house specification, part 5, "Incident"): what happened, the people
     involved (welfare details behind Show), follow-up actions and the log. The primary action is
     Close; a reviewer can also change the severity or category, add a person or an action, and
     reopen a closed incident. Opening the page is audited. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

type Severity = 'minor' | 'moderate' | 'serious'
type State = 'reported' | 'in_review' | 'closed'
type Involvement = 'affected' | 'witness' | 'helped' | 'other'
interface Person {
  id: string
  accountId: string | null
  name: string | null
  contact: string | null
  involvement: Involvement
  isChild: boolean
  details: string | null
}
interface Action {
  id: string
  what: string
  ownerId: string | null
  dueOn: string | null
  state: 'open' | 'done' | 'dropped'
  resolvedAt: number | null
  resolvedNote: string | null
}
interface Update {
  id: string
  kind: 'comment' | 'state' | 'severity' | 'category'
  from: string | null
  to: string | null
  body: string | null
  authorId: string
  at: number
}
interface Incident {
  id: string
  reference: string
  kind: 'incident' | 'near_miss'
  categoryId: string | null
  severity: Severity
  state: State
  whereNote: string | null
  occurredAt: number
  whatHappened: string
  immediateAction: string | null
  firstAidGiven: boolean
  emergencyServicesCalled: boolean
  reportedBy: { id: string, name: string }
  reportedAt: number
  closedAt: number | null
  closingNote: string | null
  people: Person[]
  actions: Action[]
  updates: Update[]
  names: Record<string, string>
  categories: { id: string, label: string }[]
}

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const { dateTime, day } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<Incident>(() => `/api/front-of-house/incidents/${encodeURIComponent(id.value)}`, { key: `front-of-house:incident:${id.value}` })

const STATE = { reported: 'warning', in_review: 'info', closed: 'neutral' } as const
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const at = (path: string) => `/api/front-of-house/incidents/${encodeURIComponent(id.value)}${path}`

async function act(path: string, body: Record<string, unknown>, done: string): Promise<boolean> {
  refusal.value = null
  try {
    await $api(at(path), { method: path.endsWith('/index') ? 'PUT' : 'POST', body })
    toast.add({ title: done, color: 'success' })
    await refresh()
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    return false
  }
}

// Dialogs: one open at a time.
const dialog = ref<'close' | 'review' | 'reopen' | 'person' | 'action' | null>(null)
const closeForm = ref({ note: '' })
const reviewForm = ref({ severity: 'minor' as Severity, categoryId: '', comment: '' })
const reopenForm = ref({ reason: '' })
const personForm = ref({ name: '', contact: '', involvement: 'affected' as Involvement, isChild: false, details: '' })
const actionForm = ref({ what: '', dueOn: null as string | null })
function open(which: NonNullable<typeof dialog.value>) {
  const d = data.value!
  refusal.value = null
  if (which === 'review') reviewForm.value = { severity: d.severity, categoryId: d.categoryId ?? '', comment: '' }
  if (which === 'close') closeForm.value = { note: '' }
  if (which === 'reopen') reopenForm.value = { reason: '' }
  if (which === 'person') personForm.value = { name: '', contact: '', involvement: 'affected', isChild: false, details: '' }
  if (which === 'action') actionForm.value = { what: '', dueOn: null }
  dialog.value = which
}
async function submit() {
  const which = dialog.value
  let ok = false
  if (which === 'close') ok = await act('/close', { note: closeForm.value.note.trim() }, t('front-of-house.incident.closed'))
  if (which === 'reopen') ok = await act('/reopen', { reason: reopenForm.value.reason.trim() }, t('front-of-house.incident.reopened'))
  if (which === 'review') {
    const f = reviewForm.value
    ok = await act('/review', { severity: f.severity, categoryId: f.categoryId || null, comment: f.comment.trim() || null }, t('front-of-house.incident.reviewed'))
  }
  if (which === 'person') {
    const f = personForm.value
    ok = await act('/people', { name: f.name.trim() || null, contact: f.contact.trim() || null, involvement: f.involvement, isChild: f.isChild, details: f.details.trim() || null }, t('front-of-house.incident.person-added'))
  }
  if (which === 'action') ok = await act('/actions', { what: actionForm.value.what.trim(), dueOn: actionForm.value.dueOn || null }, t('front-of-house.incident.action-added'))
  if (ok) dialog.value = null
}
async function resolve(action: Action, state: 'done' | 'dropped') {
  await act(`/actions/${encodeURIComponent(action.id)}/resolve`, { state }, t(`front-of-house.incident.action-${state}`))
}
async function startReview() {
  await act('/open', {}, t('front-of-house.incident.opened'))
}

const shown = ref(new Set<string>())
function toggle(personId: string) {
  const next = new Set(shown.value)
  if (next.has(personId)) next.delete(personId)
  else next.add(personId)
  shown.value = next
}

const severities = computed(() => (['minor', 'moderate', 'serious'] as const).map(value => ({ value, label: t(`front-of-house.severities.${value}`) })))
const involvements = computed(() => (['affected', 'witness', 'helped', 'other'] as const).map(value => ({ value, label: t(`front-of-house.involvements.${value}`) })))
const categoryItems = computed(() => [{ value: '', label: t('front-of-house.incident.no-category') }, ...(data.value?.categories ?? []).map(c => ({ value: c.id, label: c.label }))])
const categoryLabel = (catId: string | null) => catId ? data.value?.categories.find(c => c.id === catId)?.label ?? '' : t('front-of-house.incident.no-category')
const nameOf = (accountId: string | null) => accountId ? data.value?.names[accountId] ?? '' : ''

const primary = computed(() => {
  const d = data.value
  if (!d) return null
  if (d.state === 'reported') return { label: t('front-of-house.incident.start-review'), icon: 'i-lucide-folder-open', run: startReview }
  if (d.state === 'in_review') return { label: t('front-of-house.incident.close'), icon: 'i-lucide-circle-check', run: async () => open('close') }
  return { label: t('front-of-house.incident.reopen'), icon: 'i-lucide-rotate-ccw', run: async () => open('reopen') }
})
const actions = computed<DropdownMenuItem[][]>(() => {
  const d = data.value
  if (!d || d.state === 'closed') return []
  return [[
    { label: t('front-of-house.incident.change-severity'), icon: 'i-lucide-gauge', onSelect: () => open('review') },
    { label: t('front-of-house.incident.add-person'), icon: 'i-lucide-user-plus', onSelect: () => open('person') },
    { label: t('front-of-house.incident.add-action'), icon: 'i-lucide-list-plus', onSelect: () => open('action') },
  ]]
})
const summary = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    { label: t('front-of-house.incidents.column.kind'), value: t(`front-of-house.incident-kinds.${d.kind}`) },
    { label: t('front-of-house.incidents.column.occurred'), value: dateTime(d.occurredAt) },
    { label: t('front-of-house.incident.category'), value: categoryLabel(d.categoryId) },
    { label: t('front-of-house.incidents.column.severity'), value: t(`front-of-house.severities.${d.severity}`) },
    { label: t('front-of-house.incident.reported-by'), value: d.reportedBy.name },
    ...(d.whereNote ? [{ label: t('front-of-house.incident.where'), value: d.whereNote }] : []),
  ]
})
const logLine = (u: Update) => {
  if (u.kind === 'comment') return u.body ?? t('front-of-house.incident.log.removed')
  if (u.kind === 'state') return t('front-of-house.incident.log.state', { to: u.to ? t(`front-of-house.incident-states.${u.to}`) : '' }) + (u.body ? `: ${u.body}` : '')
  if (u.kind === 'severity') return t('front-of-house.incident.log.severity', { to: u.to ? t(`front-of-house.severities.${u.to}`) : '' })
  return t('front-of-house.incident.log.category', { to: categoryLabel(u.to) })
}
const timeline = computed(() => (data.value?.updates ?? []).map(u => ({ value: u.id, title: logLine(u), description: `${nameOf(u.authorId)} · ${dateTime(u.at)}`, icon: u.kind === 'comment' ? 'i-lucide-message-square' : 'i-lucide-history' })))
const trail = computed(() => [{ label: t('front-of-house.navigation.incidents.label'), to: '/console/front-of-house/incidents' }])
const dialogTitle = computed(() => dialog.value ? t(`front-of-house.incident.dialog.${dialog.value}`) : '')
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
        :title="d.reference"
        :status="{ label: t(`front-of-house.incident-states.${d.state}`), tone: STATE[d.state as State] }"
        :actions="actions"
        :summary="summary"
        record-type="front-of-house.incident"
        :record-id="d.id"
        :tabs="[{ id: 'incident', label: t('front-of-house.incident.tab') }]"
        :trail="trail"
        :primary="primary ?? undefined"
        @primary="primary?.run()"
      >
        <template #tab-incident>
          <div class="space-y-6">
            <RefusalNotice :refusal="refusal" />
            <PageSection :title="t('front-of-house.incident.what-happened')">
              <div class="space-y-3">
                <p class="whitespace-pre-line">
                  {{ d.whatHappened }}
                </p>
                <p
                  v-if="d.immediateAction"
                  class="whitespace-pre-line"
                >
                  <span class="font-medium">{{ t('front-of-house.incident.immediate-action') }}</span>
                  {{ d.immediateAction }}
                </p>
                <div class="flex flex-wrap gap-2">
                  <StatusBadge
                    v-if="d.firstAidGiven"
                    tone="warning"
                    :label="t('front-of-house.incident.first-aid')"
                  />
                  <StatusBadge
                    v-if="d.emergencyServicesCalled"
                    tone="danger"
                    :label="t('front-of-house.incident.emergency-services')"
                  />
                </div>
                <p
                  v-if="d.closingNote"
                  class="whitespace-pre-line text-muted"
                >
                  {{ t('front-of-house.incident.closing-note', { note: d.closingNote }) }}
                </p>
              </div>
            </PageSection>

            <PageSection :title="t('front-of-house.incident.people')">
              <template
                v-if="d.state !== 'closed'"
                #actions
              >
                <UButton
                  icon="i-lucide-user-plus"
                  color="neutral"
                  variant="outline"
                  :label="t('front-of-house.incident.add-person')"
                  @click="open('person')"
                />
              </template>
              <p
                v-if="!d.people.length"
                class="text-muted"
              >
                {{ t('front-of-house.incident.no-people') }}
              </p>
              <RecordList
                v-else
                :label="t('front-of-house.incident.people')"
              >
                <RecordListItem
                  v-for="p in d.people"
                  :key="p.id"
                  icon="i-lucide-user"
                  :name="p.name ?? t('front-of-house.incident.unnamed')"
                  :description="[t(`front-of-house.involvements.${p.involvement}`), p.isChild ? t('front-of-house.incident.child') : null, p.contact].filter(Boolean).join(' · ')"
                >
                  <UButton
                    v-if="p.details"
                    color="neutral"
                    variant="ghost"
                    :label="shown.has(p.id) ? t('front-of-house.incident.hide') : t('front-of-house.incident.show')"
                    :aria-expanded="shown.has(p.id)"
                    @click="toggle(p.id)"
                  />
                  <template
                    v-if="p.details && shown.has(p.id)"
                    #below
                  >
                    <p class="whitespace-pre-line text-sm">
                      {{ p.details }}
                    </p>
                  </template>
                </RecordListItem>
              </RecordList>
            </PageSection>

            <PageSection :title="t('front-of-house.incident.actions')">
              <template
                v-if="d.state !== 'closed'"
                #actions
              >
                <UButton
                  icon="i-lucide-list-plus"
                  color="neutral"
                  variant="outline"
                  :label="t('front-of-house.incident.add-action')"
                  @click="open('action')"
                />
              </template>
              <p
                v-if="!d.actions.length"
                class="text-muted"
              >
                {{ t('front-of-house.incident.no-actions') }}
              </p>
              <RecordList
                v-else
                :label="t('front-of-house.incident.actions')"
              >
                <RecordListItem
                  v-for="a in d.actions"
                  :key="a.id"
                  icon="i-lucide-list-todo"
                  :name="a.what"
                  :description="[a.ownerId ? nameOf(a.ownerId) : null, a.dueOn ? t('front-of-house.incident.due', { when: day(a.dueOn) }) : null].filter(Boolean).join(' · ')"
                  :muted="a.state !== 'open'"
                >
                  <div
                    v-if="a.state === 'open'"
                    class="flex gap-2"
                  >
                    <UButton
                      color="neutral"
                      variant="outline"
                      :label="t('front-of-house.incident.mark-done')"
                      loading-auto
                      @click="resolve(a, 'done')"
                    />
                    <UButton
                      color="neutral"
                      variant="ghost"
                      :label="t('front-of-house.incident.drop')"
                      loading-auto
                      @click="resolve(a, 'dropped')"
                    />
                  </div>
                  <StatusBadge
                    v-else
                    tone="neutral"
                    :label="t(`front-of-house.incident.action-state.${a.state}`)"
                  />
                </RecordListItem>
              </RecordList>
            </PageSection>

            <PageSection :title="t('front-of-house.incident.log')">
              <UTimeline :items="timeline" />
            </PageSection>
          </div>
        </template>
      </PageRecord>

      <UModal
        :open="dialog !== null"
        :title="dialogTitle"
        @update:open="v => { if (!v) dialog = null }"
      >
        <template #body>
          <UForm
            id="front-of-house-incident-dialog"
            class="space-y-4"
            :state="{ closeForm, reviewForm, reopenForm, personForm, actionForm }"
            @submit="submit"
          >
            <RefusalNotice :refusal="refusal" />
            <p
              v-if="dialog === 'close' || dialog === 'reopen' || dialog === 'review' || dialog === 'person'"
              class="text-sm text-muted"
            >
              {{ t('front-of-house.incident.standing-line') }}
            </p>
            <template v-if="dialog === 'close'">
              <UFormField
                :label="t('front-of-house.incident.closing-note-label')"
                required
              >
                <UTextarea
                  v-model="closeForm.note"
                  :rows="4"
                  maxlength="2000"
                />
              </UFormField>
            </template>
            <template v-if="dialog === 'reopen'">
              <UFormField
                :label="t('front-of-house.incident.reopen-reason')"
                required
              >
                <UTextarea
                  v-model="reopenForm.reason"
                  :rows="3"
                  maxlength="2000"
                />
              </UFormField>
            </template>
            <template v-if="dialog === 'review'">
              <UFormField :label="t('front-of-house.incidents.column.severity')">
                <USelect
                  v-model="reviewForm.severity"
                  :items="severities"
                  value-key="value"
                />
              </UFormField>
              <UFormField :label="t('front-of-house.incident.category')">
                <USelectMenu
                  v-model="reviewForm.categoryId"
                  :items="categoryItems"
                  value-key="value"
                />
              </UFormField>
              <UFormField :label="t('front-of-house.incident.comment')">
                <UTextarea
                  v-model="reviewForm.comment"
                  :rows="3"
                  maxlength="2000"
                />
              </UFormField>
            </template>
            <template v-if="dialog === 'person'">
              <UFormField :label="t('front-of-house.incident.person-name')">
                <UInput
                  v-model="personForm.name"
                  maxlength="120"
                />
              </UFormField>
              <UFormField :label="t('front-of-house.incident.person-contact')">
                <UInput
                  v-model="personForm.contact"
                  maxlength="200"
                />
              </UFormField>
              <UFormField :label="t('front-of-house.incident.involvement')">
                <USelect
                  v-model="personForm.involvement"
                  :items="involvements"
                  value-key="value"
                />
              </UFormField>
              <UCheckbox
                v-model="personForm.isChild"
                :label="t('front-of-house.incident.is-child')"
              />
              <UFormField
                :label="t('front-of-house.incident.welfare')"
                :help="t('front-of-house.incident.welfare-help')"
              >
                <UTextarea
                  v-model="personForm.details"
                  :rows="3"
                  maxlength="2000"
                />
              </UFormField>
            </template>
            <template v-if="dialog === 'action'">
              <UFormField
                :label="t('front-of-house.incident.action-what')"
                required
              >
                <UInput
                  v-model="actionForm.what"
                  maxlength="300"
                />
              </UFormField>
              <UFormField :label="t('front-of-house.incident.action-due')">
                <FieldDate v-model="actionForm.dueOn" />
              </UFormField>
            </template>
          </UForm>
        </template>
        <template #footer>
          <UButton
            type="submit"
            form="front-of-house-incident-dialog"
            :label="dialogTitle"
          />
        </template>
      </UModal>
    </template>
  </DataBoundary>
</template>
