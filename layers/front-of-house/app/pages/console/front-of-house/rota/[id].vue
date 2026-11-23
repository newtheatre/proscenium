<!-- One performance's rota (Front of house specification, part 5, "Performance rota"): each shift
     with its people and their states. Someone who runs the rota adds a person (eligibility is
     checked, and can be overridden with a reason recorded), confirms or declines requests, removes
     someone, changes places, publishes, adds a shift or applies a template. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

interface Person {
  assignmentId: string
  accountId: string
  name: string
  state: string
}
interface Shift {
  id: string
  title: string | null
  dutyName: string
  places: number
  placesTaken: number
  callAt: number
  endsAt: number
  briefing: string | null
  state: 'draft' | 'published' | 'completed' | 'cancelled'
  people: Person[]
}
interface Rota {
  performance: { title: string, startsAt: number, venue: string | null } | null
  shifts: Shift[]
  templates: { id: string, name: string, isDefault: boolean }[]
}

const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { dateTime, time } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<Rota>(() => `/api/front-of-house/performances/${encodeURIComponent(id.value)}/rota`, { key: `front-of-house:rota:${id.value}` })
const { data: choices } = await useAPI<{ duties: { id: string, name: string }[] }>('/api/front-of-house/choices', { key: 'front-of-house:choices' })

const TONES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  requested: 'info', confirmed: 'success', checked_in: 'success', release_requested: 'warning', worked: 'neutral', no_show: 'danger', released: 'neutral', removed: 'neutral',
}
// People who gave up their place or were taken off it: kept on the record, hidden until asked for.
const GONE = ['released', 'removed']
const showGone = reactive<Record<string, boolean>>({})
const peopleShown = (s: Shift) => showGone[s.id] ? s.people : s.people.filter(p => !GONE.includes(p.state))
const goneCount = (s: Shift) => s.people.filter(p => GONE.includes(p.state)).length
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function act(path: string, body: Record<string, unknown>, done: string, method: 'POST' | 'PATCH' = 'POST'): Promise<boolean> {
  refusal.value = null
  try {
    await write(path, { method, body })
    toast.add({ title: done, color: 'success' })
    await refresh()
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    return false
  }
}
const assignment = (p: Person, action: string) => `/api/front-of-house/assignments/${encodeURIComponent(p.assignmentId)}/${action}`
const shiftPath = (s: Shift, action = '') => `/api/front-of-house/shifts/${encodeURIComponent(s.id)}${action}`

async function remove(s: Shift, p: Person) {
  if (!await confirm({ verb: t('front-of-house.rota.remove.verb'), thing: t('front-of-house.rota.remove.thing', { name: p.name, duty: s.dutyName }), consequence: t('front-of-house.rota.remove.consequence'), button: t('front-of-house.rota.remove.button') })) return
  await act(assignment(p, 'remove'), {}, t('front-of-house.rota.remove.done', { name: p.name }))
}
const personActions = (s: Shift, p: Person): DropdownMenuItem[][] => {
  const groups: DropdownMenuItem[][] = []
  if (p.state === 'requested') groups.push([
    { label: t('front-of-house.rota.confirm'), icon: 'i-lucide-check', onSelect: () => { void act(assignment(p, 'confirm'), {}, t('front-of-house.rota.confirmed', { name: p.name })) } },
    { label: t('front-of-house.rota.decline'), icon: 'i-lucide-x', onSelect: () => { void act(assignment(p, 'decline'), {}, t('front-of-house.rota.declined', { name: p.name })) } },
  ])
  if (['confirmed', 'release_requested', 'checked_in'].includes(p.state)) groups.push([{ label: t('front-of-house.rota.remove.button'), icon: 'i-lucide-user-minus', color: 'error', onSelect: () => { void remove(s, p) } }])
  return groups
}

// Adding a person, with the override offered once the server says they are not eligible.
const adding = ref<Shift | null>(null)
const person = ref<string | undefined>()
const needsOverride = ref(false)
function startAdding(s: Shift) {
  adding.value = s
  person.value = undefined
  needsOverride.value = false
  refusal.value = null
}
async function add() {
  const ok = await act(shiftPath(adding.value!, '/assign'), { accountId: person.value, ...(needsOverride.value ? { override: true } : {}) }, t('front-of-house.rota.added'))
  if (ok) adding.value = null
  else needsOverride.value = refusal.value?.code === 'front-of-house.not-eligible'
}

// Changing a shift: its times, briefing and places, or cancelling it.
const editing = ref<Shift | null>(null)
const shiftForm = ref({ callAt: null as number | null, endsAt: null as number | null, briefing: '', places: 1 })
const cancelReason = ref('')
const editRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
function startEditing(s: Shift) {
  editing.value = s
  shiftForm.value = { callAt: s.callAt, endsAt: s.endsAt, briefing: s.briefing ?? '', places: s.places }
  cancelReason.value = ''
  editRefusal.value = null
}
function validateShift() {
  const errors: { name: string, message: string }[] = []
  if (!shiftForm.value.callAt) errors.push({ name: 'callAt', message: t('front-of-house.rota.edit.call-needed') })
  if (!shiftForm.value.endsAt) errors.push({ name: 'endsAt', message: t('front-of-house.rota.edit.end-needed') })
  else if (shiftForm.value.callAt && shiftForm.value.endsAt <= shiftForm.value.callAt) errors.push({ name: 'endsAt', message: t('front-of-house.rota.edit.end-after') })
  return errors
}
async function saveShift() {
  const s = editing.value!
  const f = shiftForm.value
  const body: Record<string, unknown> = {}
  if (f.callAt !== s.callAt) body.callAt = f.callAt
  if (f.endsAt !== s.endsAt) body.endsAt = f.endsAt
  if ((f.briefing.trim() || null) !== s.briefing) body.briefing = f.briefing.trim() || null
  if (f.places !== s.places) body.places = f.places
  if (!Object.keys(body).length) {
    editing.value = null
    return
  }
  editRefusal.value = null
  try {
    await write(shiftPath(s), { method: 'PATCH', body })
    toast.add({ title: t('front-of-house.rota.edit.saved', { duty: shiftName(s) }), color: 'success' })
    editing.value = null
    await refresh()
  }
  catch (e) {
    editRefusal.value = toRefusal(e)
  }
}
const reasonError = ref<string | undefined>()
async function cancelShift() {
  const s = editing.value!
  reasonError.value = cancelReason.value.trim() ? undefined : t('front-of-house.rota.edit.reason-needed')
  if (reasonError.value) return
  if (!await confirm({ verb: t('front-of-house.rota.edit.cancel-verb'), thing: t('front-of-house.rota.edit.cancel-thing', { duty: shiftName(s) }), consequence: t('front-of-house.rota.edit.cancel-consequence', { count: s.placesTaken }), button: t('front-of-house.rota.edit.cancel-button') })) return
  editRefusal.value = null
  try {
    await write(shiftPath(s, '/cancel'), { method: 'POST', body: { reason: cancelReason.value.trim() } })
    toast.add({ title: t('front-of-house.rota.edit.cancelled', { duty: shiftName(s) }), color: 'success' })
    editing.value = null
    await refresh()
  }
  catch (e) {
    editRefusal.value = toRefusal(e)
  }
}

// A new shift, or a template applied. The default template is chosen first.
const newShift = ref({ dutyId: undefined as string | undefined, places: 2 }) // not-policy: a new shift's starting places
const template = ref<string | undefined>()
watch(() => data.value?.templates, (list) => {
  if (!template.value || !list?.some(x => x.id === template.value)) template.value = list?.find(x => x.isDefault)?.id
}, { immediate: true })
const templateError = ref(false)
const dutyError = ref(false)
async function applyTemplate() {
  if (!template.value) {
    templateError.value = true
    return
  }
  refusal.value = null
  try {
    const result = await write<{ added: unknown[] }>(`${base.value}/apply`, { method: 'POST', body: { templateId: template.value } })
    if (result.added.length) toast.add({ title: t('front-of-house.rota.template-applied'), color: 'success' })
    else toast.add({ title: t('front-of-house.rota.nothing-to-add'), color: 'info' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const dutyItems = computed(() => (choices.value?.duties ?? []).map(d => ({ value: d.id, label: d.name })))
const templateItems = computed(() => (data.value?.templates ?? []).map(x => ({ value: x.id, label: x.isDefault ? t('front-of-house.rota.default-template', { name: x.name }) : x.name })))
const base = computed(() => `/api/front-of-house/performances/${encodeURIComponent(id.value)}/shifts`)
async function addShift() {
  if (!newShift.value.dutyId) {
    dutyError.value = true
    return
  }
  if (await act(base.value, { dutyId: newShift.value.dutyId, places: newShift.value.places }, t('front-of-house.rota.shift-added'))) newShift.value = { dutyId: undefined, places: 2 } // not-policy: a new shift's starting places
}

const drafts = computed(() => (data.value?.shifts ?? []).filter(s => s.state === 'draft').length)
const title = computed(() => data.value?.performance ? t('front-of-house.rota.title', { show: data.value.performance.title, when: dateTime(data.value.performance.startsAt) }) : t('front-of-house.navigation.rota.label'))
const trail = computed(() => [{ label: t('front-of-house.navigation.rota.label'), to: '/console/front-of-house/rota' }])
const shiftName = (s: Shift) => s.title ? `${s.dutyName}: ${s.title}` : s.dutyName
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
        :description="d.performance?.venue ?? undefined"
        long-title
      >
        <template #primary>
          <UButton
            v-if="drafts"
            icon="i-lucide-send"
            :label="t('front-of-house.rota.publish-all', { count: drafts })"
            loading-auto
            @click="act(`${base}/publish`, {}, t('front-of-house.rota.published', { count: drafts }))"
          />
        </template>
        <div class="space-y-6">
          <RefusalNotice :refusal="refusal" />
          <EmptyState
            v-if="!d.shifts.length"
            :title="t('front-of-house.rota.no-shifts-title')"
            :description="t('front-of-house.rota.no-shifts-description')"
            icon="i-lucide-calendar-range"
          />
          <PageSection
            v-for="s in d.shifts"
            :key="s.id"
            :title="shiftName(s)"
            :description="`${t('front-of-house.rota.shift-times', { from: time(s.callAt), to: time(s.endsAt) })} · ${t('front-of-house.shift.places-value', { taken: s.placesTaken, places: s.places })}`"
          >
            <template #actions>
              <div class="flex items-center gap-2">
                <StatusBadge
                  :tone="s.state === 'published' ? 'success' : 'neutral'"
                  :label="t(s.state === 'completed' ? 'front-of-house.shift-states.completed' : `core.states.${s.state}`)"
                />
                <UButton
                  v-if="s.state === 'draft'"
                  color="neutral"
                  variant="outline"
                  :label="t('front-of-house.rota.publish-one')"
                  loading-auto
                  @click="act(shiftPath(s, '/publish'), {}, t('front-of-house.rota.published', { count: 1 }))"
                />
                <IconButton
                  v-if="s.state === 'draft' || s.state === 'published'"
                  icon="i-lucide-pencil"
                  :label="t('front-of-house.rota.edit.open', { duty: shiftName(s) })"
                  @click="startEditing(s)"
                />
              </div>
            </template>
            <div class="space-y-4">
              <p
                v-if="s.briefing"
                class="whitespace-pre-line text-sm text-muted"
              >
                {{ s.briefing }}
              </p>
              <p
                v-if="!peopleShown(s).length"
                class="text-sm text-muted"
              >
                {{ t('front-of-house.shift.nobody-yet') }}
              </p>
              <RecordList
                v-else
                :label="t('front-of-house.rota.people-on', { duty: shiftName(s) })"
              >
                <RecordListItem
                  v-for="p in peopleShown(s)"
                  :key="p.assignmentId"
                  icon="i-lucide-user"
                  :name="p.name"
                  :muted="['released', 'removed', 'no_show'].includes(p.state)"
                >
                  <div class="flex items-center gap-2">
                    <StatusBadge
                      :tone="TONES[p.state] ?? 'neutral'"
                      :label="t(`front-of-house.assignment-states.${p.state}`)"
                    />
                    <RowActions
                      :items="personActions(s, p)"
                      :label="t('front-of-house.actions-for', { name: p.name })"
                    />
                  </div>
                </RecordListItem>
              </RecordList>
              <UButton
                v-if="goneCount(s)"
                color="neutral"
                variant="link"
                class="px-0"
                :label="showGone[s.id] ? t('front-of-house.rota.hide-gone') : t('front-of-house.rota.show-gone', { count: goneCount(s) })"
                @click="showGone[s.id] = !showGone[s.id]"
              />
              <div v-if="s.state === 'draft' || s.state === 'published'">
                <UButton
                  icon="i-lucide-user-plus"
                  color="neutral"
                  variant="outline"
                  :label="t('front-of-house.rota.add-person')"
                  @click="startAdding(s)"
                />
              </div>
            </div>
          </PageSection>

          <PageSection :title="t('front-of-house.rota.add-shift')">
            <div class="flex flex-col gap-4">
              <!-- With nothing set yet the template is the quick way, so it leads and is the main button. -->
              <div
                v-if="templateItems.length"
                class="flex flex-wrap items-end gap-3"
                :class="d.shifts.length ? 'order-last' : ''"
              >
                <UFormField
                  name="template"
                  :label="t('front-of-house.rota.template')"
                  :error="templateError ? t('front-of-house.rota.choose-template-first') : undefined"
                >
                  <USelectMenu
                    v-model="template"
                    :items="templateItems"
                    value-key="value"
                    :placeholder="t('front-of-house.rota.choose-template')"
                    @update:model-value="templateError = false"
                  />
                </UFormField>
                <UButton
                  :color="d.shifts.length ? 'neutral' : 'primary'"
                  :variant="d.shifts.length ? 'outline' : 'solid'"
                  :label="t('front-of-house.rota.apply')"
                  loading-auto
                  @click="applyTemplate"
                />
              </div>
              <div class="flex flex-wrap items-end gap-3">
                <UFormField
                  :label="t('front-of-house.templates.duty')"
                  :error="dutyError ? t('front-of-house.rota.choose-duty-first') : undefined"
                >
                  <USelectMenu
                    v-model="newShift.dutyId"
                    :items="dutyItems"
                    value-key="value"
                    :placeholder="t('front-of-house.rota.choose-duty')"
                    @update:model-value="dutyError = false"
                  />
                </UFormField>
                <UFormField :label="t('front-of-house.templates.places')">
                  <FieldNumber
                    v-model="newShift.places"
                    :min="1"
                    :max="50"
                  />
                </UFormField>
                <UButton
                  :color="d.shifts.length || !templateItems.length ? 'primary' : 'neutral'"
                  :variant="d.shifts.length || !templateItems.length ? 'solid' : 'outline'"
                  :label="t('front-of-house.rota.add-shift-button')"
                  loading-auto
                  @click="addShift"
                />
              </div>
            </div>
          </PageSection>
        </div>
      </PageFrame>

      <UModal
        :open="adding !== null"
        :title="adding ? t('front-of-house.rota.add-to', { duty: shiftName(adding) }) : ''"
        @update:open="v => { if (!v) adding = null }"
      >
        <template #body>
          <div class="space-y-4">
            <RefusalNotice :refusal="refusal" />
            <UFormField :label="t('front-of-house.rota.person')">
              <PersonPicker
                v-model="person"
                :endpoint="adding ? `/api/front-of-house/shifts/${encodeURIComponent(adding.id)}/people` : undefined"
                :exclude="adding?.people.map(p => p.accountId)"
                @update:model-value="needsOverride = false"
              />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <UButton
            :label="needsOverride ? t('front-of-house.rota.add-anyway') : t('front-of-house.rota.add-person')"
            :color="needsOverride ? 'warning' : 'primary'"
            :disabled="!person"
            loading-auto
            @click="add"
          />
        </template>
      </UModal>

      <USlideover
        :open="editing !== null"
        :title="editing ? t('front-of-house.rota.edit.title', { duty: shiftName(editing) }) : ''"
        @update:open="v => { if (!v) editing = null }"
      >
        <template #body>
          <div
            v-if="editing"
            class="space-y-8"
          >
            <RefusalNotice :refusal="editRefusal" />
            <UForm
              class="space-y-4"
              :state="shiftForm"
              :validate="validateShift"
              novalidate
              @submit="saveShift"
            >
              <UFormField
                name="callAt"
                :label="t('front-of-house.rota.edit.call-at')"
                :help="t('front-of-house.rota.edit.call-at-help')"
                required
              >
                <FieldDateTime v-model="shiftForm.callAt" />
              </UFormField>
              <UFormField
                name="endsAt"
                :label="t('front-of-house.rota.edit.ends-at')"
                required
              >
                <FieldDateTime v-model="shiftForm.endsAt" />
              </UFormField>
              <UFormField
                name="places"
                :label="t('front-of-house.templates.places')"
                :help="t('front-of-house.rota.edit.places-help', { count: editing.placesTaken })"
              >
                <FieldNumber
                  v-model="shiftForm.places"
                  :min="Math.max(1, editing.placesTaken)"
                  :max="50"
                />
              </UFormField>
              <UFormField
                name="briefing"
                :label="t('front-of-house.rota.edit.briefing')"
                :help="t('front-of-house.rota.edit.briefing-help')"
              >
                <UTextarea
                  v-model="shiftForm.briefing"
                  maxlength="1000"
                  :rows="4"
                />
              </UFormField>
              <UButton
                type="submit"
                :label="t('front-of-house.save')"
                loading-auto
              />
            </UForm>
            <PageSection
              :title="t('front-of-house.rota.edit.cancel-title')"
              :description="t('front-of-house.rota.edit.cancel-description')"
            >
              <div class="space-y-3">
                <UFormField
                  :label="t('front-of-house.rota.edit.reason')"
                  :error="reasonError"
                  required
                >
                  <UInput
                    v-model="cancelReason"
                    maxlength="200"
                    @update:model-value="reasonError = undefined"
                  />
                </UFormField>
                <UButton
                  color="error"
                  variant="outline"
                  icon="i-lucide-calendar-x"
                  :label="t('front-of-house.rota.edit.cancel-button')"
                  loading-auto
                  @click="cancelShift"
                />
              </div>
            </PageSection>
          </div>
        </template>
      </USlideover>
    </template>
  </DataBoundary>
</template>
