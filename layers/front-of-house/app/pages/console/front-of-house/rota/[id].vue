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
  state: 'draft' | 'published' | 'completed' | 'cancelled'
  people: Person[]
}
interface Rota {
  performance: { title: string, startsAt: number, venue: string | null } | null
  shifts: Shift[]
  templates: { id: string, name: string, isDefault: boolean }[]
}

const { t } = useT()
const { $api } = useNuxtApp()
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
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function act(path: string, body: Record<string, unknown>, done: string, method: 'POST' | 'PATCH' = 'POST'): Promise<boolean> {
  refusal.value = null
  try {
    await $api(path, { method, body })
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

// Places, changed in place.
async function setPlaces(s: Shift, places: number | null | undefined) {
  if (!places || places === s.places) return
  await act(shiftPath(s), { places }, t('front-of-house.rota.places-saved'), 'PATCH')
}

// A new shift, or a template applied.
const newShift = ref({ dutyId: undefined as string | undefined, places: 2 }) // not-policy: a new shift's starting places
const template = ref<string | undefined>()
const dutyItems = computed(() => (choices.value?.duties ?? []).map(d => ({ value: d.id, label: d.name })))
const templateItems = computed(() => (data.value?.templates ?? []).map(x => ({ value: x.id, label: x.isDefault ? t('front-of-house.rota.default-template', { name: x.name }) : x.name })))
const base = computed(() => `/api/front-of-house/performances/${encodeURIComponent(id.value)}/shifts`)
async function addShift() {
  if (await act(base.value, { dutyId: newShift.value.dutyId, places: newShift.value.places }, t('front-of-house.rota.shift-added'))) newShift.value = { dutyId: undefined, places: 2 } // not-policy: a new shift's starting places
}

const drafts = computed(() => (data.value?.shifts ?? []).filter(s => s.state === 'draft').length)
const title = computed(() => data.value?.performance ? t('front-of-house.rota.title', { show: data.value.performance.title }) : t('front-of-house.navigation.rota.label'))
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
        :description="d.performance ? [dateTime(d.performance.startsAt), d.performance.venue].filter(Boolean).join(' · ') : undefined"
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
            :description="t('front-of-house.rota.shift-times', { from: time(s.callAt), to: time(s.endsAt) })"
          >
            <template #actions>
              <div class="flex items-center gap-2">
                <StatusBadge
                  :tone="s.state === 'draft' ? 'warning' : s.state === 'cancelled' ? 'neutral' : 'success'"
                  :label="t(`front-of-house.shift-states.${s.state}`)"
                />
                <UButton
                  v-if="s.state === 'draft'"
                  color="neutral"
                  variant="outline"
                  :label="t('front-of-house.rota.publish-one')"
                  loading-auto
                  @click="act(shiftPath(s, '/publish'), {}, t('front-of-house.rota.published', { count: 1 }))"
                />
              </div>
            </template>
            <div class="space-y-4">
              <div class="flex flex-wrap items-end gap-3">
                <UFormField :label="t('front-of-house.rota.places-label', { taken: s.placesTaken })">
                  <UInputNumber
                    :model-value="s.places"
                    :min="1"
                    :max="50"
                    :disabled="s.state === 'cancelled' || s.state === 'completed'"
                    @update:model-value="v => setPlaces(s, v)"
                  />
                </UFormField>
                <UButton
                  v-if="s.state === 'draft' || s.state === 'published'"
                  icon="i-lucide-user-plus"
                  color="neutral"
                  variant="outline"
                  :label="t('front-of-house.rota.add-person')"
                  @click="startAdding(s)"
                />
              </div>
              <p
                v-if="!s.people.length"
                class="text-sm text-muted"
              >
                {{ t('front-of-house.shift.nobody-yet') }}
              </p>
              <RecordList
                v-else
                :label="t('front-of-house.rota.people-on', { duty: shiftName(s) })"
              >
                <RecordListItem
                  v-for="p in s.people"
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
            </div>
          </PageSection>

          <PageSection :title="t('front-of-house.rota.add-shift')">
            <div class="flex flex-wrap items-end gap-3">
              <UFormField :label="t('front-of-house.templates.duty')">
                <USelectMenu
                  v-model="newShift.dutyId"
                  :items="dutyItems"
                  value-key="value"
                  :placeholder="t('front-of-house.rota.choose-duty')"
                />
              </UFormField>
              <UFormField :label="t('front-of-house.templates.places')">
                <UInputNumber
                  v-model="newShift.places"
                  :min="1"
                  :max="50"
                />
              </UFormField>
              <UButton
                :label="t('front-of-house.rota.add-shift-button')"
                :disabled="!newShift.dutyId"
                loading-auto
                @click="addShift"
              />
            </div>
            <div
              v-if="templateItems.length"
              class="mt-4 flex flex-wrap items-end gap-3"
            >
              <UFormField :label="t('front-of-house.rota.template')">
                <USelectMenu
                  v-model="template"
                  :items="templateItems"
                  value-key="value"
                  :placeholder="t('front-of-house.rota.choose-template')"
                />
              </UFormField>
              <UButton
                color="neutral"
                variant="outline"
                :label="t('front-of-house.rota.apply')"
                :disabled="!template"
                loading-auto
                @click="act(`${base}/apply`, { templateId: template }, t('front-of-house.rota.template-applied'))"
              />
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
    </template>
  </DataBoundary>
</template>
