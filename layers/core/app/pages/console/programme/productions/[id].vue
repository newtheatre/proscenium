<script setup lang="ts">
// One production (C-02, C-03, C-09, C-23, C-24) as a record page (UI-12): tabs for its overview,
// details, dates, credits, media and guidance (age, effects, content warnings), a facts strip, and a side panel that stays beside
// every tab with the poster, managed in place, and what publishing still needs. Publishing asks
// first, showing where it will appear, or what is still to do; once published the side panel says so.
import type { DropdownMenuItem } from '@nuxt/ui'
import { z } from 'zod'
import { productionPatch } from '../../../../../server/programme/input'
import { blankAsNull } from '../../../../../shared/validation'
import { LATECOMER_RULES } from '../../../../../shared/latecomers'

type State = 'draft' | 'published' | 'withdrawn' | 'cancelled'
interface Option { id: string, label: string, retired: boolean }
interface Production {
  id: string
  slug: string
  title: string
  subtitle: string | null
  summary: string | null
  description: string | null
  kind: 'own' | 'visiting' | 'hire' | 'event'
  categoryTermId: string | null
  seasonId: string | null
  usualSpaceId: string | null
  companyName: string | null
  ageMin: number | null
  ageRestricted: boolean
  effectsConfirmedNone: boolean
  advisoriesConfirmedNone: boolean
  contentNote: string | null
  runningMinutes: number | null
  intervalCount: number
  intervalMinutes: number | null
  doorsBeforeMinutes: number | null
  capacity: number | null
  externalBookingUrl: string | null
  latecomers: string | null
  creditsPublic: boolean
  listed: boolean
  state: State
  publishedAt: number | null
  advisories: { termId: string, level: 'mentioned' | 'discussed' | 'depicted', levelAssumed: boolean, detail: string | null }[]
  effects: { termId: string, detail: string | null }[]
}
interface Need { key: string, sentence: string, link: string }
interface Answer { production: Production, needs: Need[], theatre: { runningMinutes: number, doorsBeforeMinutes: number, intervalMinutes: number, latecomers: string }, sellsHere: boolean, options: { categories: Option[], advisories: { id: string, label: string, description: string | null, groupId: string | null, retired: boolean }[], advisoryGroups: { id: string, label: string }[], effects: { id: string, label: string, description: string | null, icon: string | null, retired: boolean }[], reasons: Option[], seasons: { id: string, name: string }[], spaces: { id: string, label: string }[] } }

const { t } = useT()
const { $api } = useNuxtApp()
const route = useRoute()
const base = computed(() => `/api/core/productions/${String(route.params.id)}`)
const { data, status, error, refresh } = await useAPI<Answer>(base, { key: `core:production:${String(route.params.id)}` })
const { toRefusal, fieldErrors } = useRefusal()
const { confirm } = useConfirm()
const say = useRecordToast(`core.production:${String(route.params.id)}`)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const production = computed(() => data.value?.production)

// The readiness checklist in the side panel reads what these change.
const reload = () => Promise.all([refresh(), refreshNuxtData(`core:record-checks:core.production:${String(route.params.id)}`)])

function api(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body: object = {}): Promise<unknown> {
  return $api<unknown>(`${base.value}${path}` as string, { method, body })
}
// A form's own save passes the form, so what the server refuses shows beside each field.
async function run(fn: () => Promise<unknown>, done?: string, form?: { setErrors: (errors: { name: string, message: string }[]) => void } | null) {
  refusal.value = null
  try {
    await fn()
    await reload()
    if (done) say({ title: done })
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    form?.setErrors(fieldErrors(refusal.value))
    return false
  }
}

const KINDS = computed(() => (['own', 'visiting', 'hire', 'event'] as const).map(value => ({ value, label: t(`core.productions.kinds.${value}`) })))
const NONE = '__none'
const TONES = { draft: 'neutral', published: 'success', withdrawn: 'warning', cancelled: 'danger' } as const
const STATE_TONES = { scheduled: 'success', draft: 'neutral', cancelled: 'danger', completed: 'neutral' } as const
const categories = computed(() => (data.value?.options.categories ?? []).filter(c => !c.retired || c.id === production.value?.categoryTermId).map(c => ({ value: c.id, label: c.label })))
const seasons = computed(() => [{ value: NONE, label: t('core.productions.new.no-season') }, ...(data.value?.options.seasons ?? []).map(s => ({ value: s.id, label: s.name }))])
const spaces = computed(() => [{ value: NONE, label: t('core.productions.new.space-none') }, ...(data.value?.options.spaces ?? []).map(s => ({ value: s.id, label: s.label }))])

// Details
const details = reactive({
  title: '', slug: '', subtitle: '', summary: '', description: '', kind: 'own' as Production['kind'], categoryTermId: '', seasonId: NONE, usualSpaceId: NONE, companyName: '',
  contentNote: '', runningMinutes: null as number | null, intervalCount: 0, intervalMinutes: null as number | null, doorsBeforeMinutes: null as number | null,
  capacity: null as number | null, bookedElsewhere: false, externalBookingUrl: '', latecomers: NONE as string, creditsPublic: true, listed: true,
})
// When latecomers are let in: the theatre's usual practice unless the show says otherwise. Each date may differ too.
const latecomerItems = computed(() => [
  { value: NONE, label: t('core.production.latecomers.usual', { rule: t(`core.latecomers.short.${data.value?.theatre.latecomers ?? 'suitable-point'}`).toLowerCase() }) },
  ...LATECOMER_RULES.map(value => ({ value, label: t(`core.latecomers.short.${value}`) })),
])
const withLatecomers = (schema: z.ZodType) => z.preprocess(v => ({ ...(v as object), latecomers: (v as { latecomers?: string }).latecomers === NONE ? null : (v as { latecomers?: string }).latecomers }), schema)
// With nothing here selling tickets, every production is booked elsewhere (Matt, 2026-11-17).
const sellsHere = computed(() => data.value?.sellsHere ?? true)
const elsewhere = computed(() => !sellsHere.value || details.bookedElsewhere)
// Checked as it will be sent, with the schema the route uses. A production ticked as booked elsewhere
// needs its link; with nothing here selling tickets a draft saves without one, and only publishing
// (and a published production) needs it.
const linkNeeded = computed(() => elsewhere.value && (sellsHere.value || production.value?.state === 'published'))
const detailsForm = useTemplateRef('detailsForm')
const detailsSchema = computed(() => withLatecomers(linkNeeded.value
  ? blankAsNull(productionPatch.extend({ externalBookingUrl: productionPatch.shape.externalBookingUrl.unwrap().unwrap() }))
  : elsewhere.value
    ? blankAsNull(productionPatch)
    : z.preprocess(v => ({ ...(v as object), externalBookingUrl: null }), blankAsNull(productionPatch))))
const detailsFrom = (p: Production) => ({
  title: p.title, slug: p.slug, subtitle: p.subtitle ?? '', summary: p.summary ?? '', description: p.description ?? '', kind: p.kind, categoryTermId: p.categoryTermId ?? '',
  seasonId: p.seasonId ?? NONE, usualSpaceId: p.usualSpaceId ?? NONE, companyName: p.companyName ?? '', contentNote: p.contentNote ?? '', runningMinutes: p.runningMinutes,
  intervalCount: p.intervalCount, intervalMinutes: p.intervalMinutes, doorsBeforeMinutes: p.doorsBeforeMinutes, capacity: p.capacity,
  bookedElsewhere: !!p.externalBookingUrl, externalBookingUrl: p.externalBookingUrl ?? '', latecomers: p.latecomers ?? NONE, creditsPublic: p.creditsPublic, listed: p.listed,
})
const resetDetails = () => production.value && Object.assign(details, detailsFrom(production.value))
watch(production, resetDetails, { immediate: true })
// Leaving the Details tab, or the page, with changes asks first; leaving drops them.
const detailsDirty = computed(() => !!production.value && JSON.stringify({ ...details }) !== JSON.stringify(detailsFrom(production.value)))
useLeaveGuard(detailsDirty, { query: ['tab'], thing: t('core.production.this-tab'), discard: resetDetails })
const saveDetails = () => run(() => api('', 'PATCH', {
  ...(({ bookedElsewhere: _, ...rest }) => rest)(details),
  categoryTermId: details.categoryTermId || null,
  seasonId: details.seasonId === NONE ? null : details.seasonId,
  usualSpaceId: details.usualSpaceId === NONE ? null : details.usualSpaceId,
  latecomers: details.latecomers === NONE ? null : details.latecomers,
  externalBookingUrl: elsewhere.value ? details.externalBookingUrl.trim() || null : null,
  runningMinutes: details.runningMinutes || null,
}), t('core.production.saved'), detailsForm.value)

// Moves. Publishing opens a window first: what is still to do, or where the page will appear.
const needs = computed(() => data.value?.needs ?? [])
const publicPath = computed(() => `/whats-on/${production.value?.slug ?? ''}`)
const publishing = ref(false)
const { data: checkList } = useNuxtData<{ checks: { id: string, done: boolean, sentence: string, needed?: boolean }[] }>(`core:record-checks:core.production:${String(route.params.id)}`)
const wanted = computed(() => (checkList.value?.checks ?? []).filter(c => c.needed === false && !c.done))
async function publish() {
  const done = await run(() => api('/publish', 'POST'))
  // Something changed since the page was read: the window shows the list as it is now, in place of the refusal.
  if (!done && refusal.value?.code === 'core.production.not-ready') {
    refusal.value = null
    await reload()
    return
  }
  publishing.value = false
  if (!done) return
  say({
    title: t('core.production.published'),
    duration: 10_000, // not-policy: the ten seconds Undo is offered for
    actions: [
      { label: t('core.production.view-public'), icon: 'i-lucide-external-link', color: 'neutral', variant: 'outline', to: publicPath.value, target: '_blank' },
      { label: t('core.undo.button'), icon: 'i-lucide-undo-2', color: 'neutral', variant: 'outline', onClick: () => { void run(() => api('/withdraw', 'POST'), t('core.production.withdrawn')) } },
    ],
  })
}
async function withdraw() {
  if (!await confirm({ verb: t('core.production.withdraw'), thing: production.value!.title, consequence: t('core.production.withdraw-consequence'), button: t('core.production.withdraw') })) return
  await run(() => api('/withdraw', 'POST'), t('core.production.withdrawn'))
}
async function duplicate() {
  refusal.value = null
  try {
    const { id } = await $api<{ id: string }>(`${base.value}/duplicate` as string, { method: 'POST', body: {} })
    say({ title: t('core.production.duplicated'), description: t('core.production.duplicated-help') })
    await navigateTo(`/console/programme/productions/${id}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const cancelling = ref(false)
async function restore() {
  if (!await confirm({ verb: t('core.production.restore'), thing: production.value!.title, consequence: t('core.production.restore-consequence'), button: t('core.production.restore') })) return
  await run(() => api('/restore', 'POST'), t('core.production.restored'))
}
async function remove() {
  if (!await confirm({ verb: t('core.production.delete'), thing: production.value!.title, consequence: t('core.production.delete-consequence'), button: t('core.production.delete-button') })) return
  if (await run(() => api('', 'DELETE'))) await navigateTo('/console/programme/productions')
}

// The page: one likely next step for the state, the rest in the menu with the destructive last.
const primary = computed(() => {
  const state = production.value?.state
  if (state === 'draft' || state === 'withdrawn') {
    const n = needs.value.length
    return { label: state === 'draft' ? t('core.production.publish') : t('core.production.publish-again'), icon: 'i-lucide-globe', hint: n ? t('core.production.to-do', { count: n }) : undefined }
  }
  if (state === 'cancelled') return { label: t('core.production.restore'), icon: 'i-lucide-undo-2' }
  return undefined
})
function onPrimary() {
  if (production.value?.state === 'cancelled') return restore()
  publishing.value = true
}
const actions = computed<DropdownMenuItem[][]>(() => {
  const p = production.value
  if (!p) return []
  // Every move is listed in every state; one that does not apply now is greyed with the reason.
  const published = p.state === 'published'
  const cancellable = published || p.state === 'withdrawn'
  const deletable = p.state === 'draft' && !p.publishedAt
  return [
    [
      { label: t('core.production.duplicate'), icon: 'i-lucide-copy', onSelect: () => { void duplicate() } },
      { label: t('core.production.withdraw'), icon: 'i-lucide-eye-off', disabled: !published, description: published ? undefined : t('core.production.withdraw-not'), onSelect: () => { void withdraw() } },
    ],
    [
      { label: t('core.production.cancel'), icon: 'i-lucide-calendar-x', color: 'error', disabled: !cancellable, description: cancellable ? undefined : p.state === 'cancelled' ? t('core.production.cancel-already') : t('core.production.cancel-draft'), onSelect: () => { cancelling.value = true } },
      { label: t('core.production.delete'), icon: 'i-lucide-trash-2', color: 'error', disabled: !deletable, description: deletable ? undefined : t('core.production.delete-not'), onSelect: () => { void remove() } },
    ],
  ]
})

// The facts strip and the overview read the dates the Dates tab shows, by the same key.
interface Dated { id: string, venueId: string, startsAt: number, endsAt: number, state: 'draft' | 'scheduled' | 'cancelled' | 'completed', label: string | null }
const { data: dated } = await useAPI<{ performances: Dated[], options: { venues: { id: string, name: string }[] } }>(() => `${base.value}/performances`, { key: `core:production:${String(route.params.id)}:performances` })
const { span, dateTime, day } = useDates()
const venueName = (id: string) => dated.value?.options.venues.find(v => v.id === id)?.name ?? ''
const performances = computed(() => dated.value?.performances ?? [])
const running = computed(() => performances.value.filter(p => p.state === 'scheduled' || p.state === 'completed'))
const oneVenue = computed(() => new Set(performances.value.map(p => p.venueId)).size <= 1)
const comingUp = computed(() => performances.value.filter(p => p.state === 'scheduled' && p.endsAt > Date.now()).slice(0, 3))
const summary = computed(() => {
  const p = production.value
  if (!p) return []
  const first = running.value[0]
  const last = running.value.at(-1)
  const next = comingUp.value[0]
  const cancelled = performances.value.filter(x => x.state === 'cancelled').length
  return [
    { label: t('core.production.facts.run'), value: first && last ? span(first.startsAt, last.startsAt) : t('core.productions.no-dates') },
    // The venue only when the run plays in more than one.
    { label: t('core.productions.columns.next'), value: next ? (oneVenue.value ? dateTime(next.startsAt) : `${dateTime(next.startsAt)}, ${venueName(next.venueId)}`) : t('core.productions.none-to-come') },
    { label: t('core.productions.season'), value: data.value?.options.seasons.find(s => s.id === p.seasonId)?.name ?? t('core.production.facts.no-season') },
    { label: t('core.production.facts.performances'), value: cancelled ? t('core.production.facts.with-cancelled', { running: running.value.length, cancelled }) : String(running.value.length) },
  ]
})
const tabs = computed(() => (['overview', 'details', 'dates', 'credits', 'media', 'advisories'] as const).map(id => ({ id, label: t(`core.production.tabs.${id}`) })))
const openTab = (tab: string) => navigateTo({ query: { ...route.query, tab } }, { replace: true })
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <PageRecord
      v-if="production"
      :title="production.title"
      :status="{ label: t(`core.states.${production.state}`), tone: TONES[production.state] }"
      :primary="primary"
      :actions="actions"
      :summary="summary"
      record-type="core.production"
      :record-id="production.id"
      :tabs="tabs"
      :trail="[{ label: t('core.productions.title'), to: '/console/programme/productions' }]"
      :checklist-title="t('core.production.ready')"
      :checklist="production.state === 'draft' || production.state === 'withdrawn'"
      aside-below
      @primary="onPrimary"
    >
      <template #aside>
        <ProductionPoster :production-id="production.id" />
        <SidePanel
          v-if="production.state === 'published'"
          :title="t('core.states.published')"
        >
          <p
            v-if="production.publishedAt"
            class="text-sm"
          >
            {{ t('core.production.first-published', { day: day(production.publishedAt) }) }}
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              :label="t('core.production.view-public')"
              icon="i-lucide-external-link"
              color="neutral"
              variant="outline"
              size="sm"
              :to="publicPath"
              target="_blank"
            />
            <UButton
              :label="t('core.production.withdraw')"
              icon="i-lucide-eye-off"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="withdraw()"
            />
          </div>
        </SidePanel>
      </template>

      <template #tab-overview>
        <div class="space-y-4">
          <RefusalNotice :refusal="refusal" />
          <PageSection :title="t('core.production.about')">
            <p
              v-if="production.subtitle"
              class="font-medium"
            >
              {{ production.subtitle }}
            </p>
            <p v-if="production.summary">
              {{ production.summary }}
            </p>
            <p
              v-else
              class="text-muted"
            >
              {{ t('core.production.no-summary') }}
            </p>
          </PageSection>
          <PageSection
            :title="t('core.productions.views.coming-up')"
            :description="comingUp.length ? undefined : t('core.production.none-coming')"
          >
            <RecordList
              v-if="comingUp.length"
              :label="t('core.productions.views.coming-up')"
            >
              <RecordListItem
                v-for="p in comingUp"
                :key="p.id"
                icon="i-lucide-calendar"
                :name="dateTime(p.startsAt)"
                :description="[venueName(p.venueId), p.label].filter(Boolean).join(', ')"
              >
                <StatusBadge
                  :tone="STATE_TONES[p.state]"
                  :label="t(`core.states.${p.state}`)"
                />
              </RecordListItem>
            </RecordList>
            <template #footer>
              <UButton
                :label="performances.length ? t('core.production.all-dates', { n: performances.length }) : t('core.production.add-dates')"
                color="neutral"
                variant="outline"
                trailing-icon="i-lucide-arrow-right"
                @click="openTab('dates')"
              />
            </template>
          </PageSection>
        </div>
      </template>

      <template #tab-details>
        <div class="space-y-4">
          <RefusalNotice :refusal="refusal" />
          <PageSection :title="t('core.production.tabs.details')">
            <UForm
              id="production-details"
              ref="detailsForm"
              :schema="detailsSchema"
              :state="details"
              class="space-y-4"
              novalidate
              @submit="saveDetails"
            >
              <UFormField
                name="title"
                :label="t('core.productions.new.title-label')"
                required
              >
                <UInput
                  v-model="details.title"
                  maxlength="200"
                />
              </UFormField>
              <UFormField
                name="subtitle"
                :label="t('core.production.fields.subtitle')"
              >
                <UInput
                  v-model="details.subtitle"
                  maxlength="200"
                />
              </UFormField>
              <UFormField
                name="summary"
                :label="t('core.production.fields.summary')"
                :help="t('core.production.fields.summary-help')"
              >
                <UTextarea
                  v-model="details.summary"
                  :rows="2"
                  maxlength="300"
                />
              </UFormField>
              <UFormField
                name="description"
                :label="t('core.production.fields.description')"
                :help="t('core.production.fields.description-help')"
              >
                <UTextarea
                  v-model="details.description"
                  :rows="6"
                  maxlength="20000"
                />
              </UFormField>
              <FieldGroup :title="t('core.production.groups.programme')">
                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField
                    name="kind"
                    :label="t('core.productions.new.kind')"
                  >
                    <USelect
                      v-model="details.kind"
                      :items="KINDS"
                    />
                  </UFormField>
                  <UFormField
                    name="categoryTermId"
                    :label="t('core.production.fields.category')"
                    :help="t('core.production.fields.needed')"
                  >
                    <USelectMenu
                      v-model="details.categoryTermId"
                      value-key="value"
                      :items="categories"
                      :placeholder="t('core.production.fields.category-choose')"
                    />
                  </UFormField>
                  <UFormField
                    name="seasonId"
                    :label="t('core.productions.season')"
                  >
                    <USelectMenu
                      v-model="details.seasonId"
                      value-key="value"
                      :items="seasons"
                    />
                  </UFormField>
                  <UFormField
                    name="usualSpaceId"
                    :label="t('core.productions.new.space')"
                    :help="t('core.productions.new.space-help')"
                  >
                    <USelectMenu
                      v-model="details.usualSpaceId"
                      value-key="value"
                      :items="spaces"
                    />
                  </UFormField>
                  <UFormField
                    v-if="details.kind !== 'own'"
                    name="companyName"
                    :label="t('core.production.fields.company')"
                  >
                    <UInput
                      v-model="details.companyName"
                      maxlength="200"
                    />
                  </UFormField>
                </div>
              </FieldGroup>
              <FieldGroup :title="t('core.production.groups.night')">
                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField
                    :label="t('core.production.fields.running')"
                    :hint="t('core.production.fields.running-hint')"
                    name="runningMinutes"
                  >
                    <DefaultedMinutes
                      v-model="details.runningMinutes"
                      :fallback="data?.theatre.runningMinutes"
                      :min="1"
                      :label="t('core.production.fields.running')"
                    />
                  </UFormField>
                  <UFormField
                    :label="t('core.production.fields.doors')"
                    name="doorsBeforeMinutes"
                  >
                    <DefaultedMinutes
                      v-model="details.doorsBeforeMinutes"
                      :fallback="data?.theatre.doorsBeforeMinutes"
                      :max="180"
                      :label="t('core.production.fields.doors')"
                    />
                  </UFormField>
                  <UFormField
                    :label="t('core.production.fields.intervals')"
                    name="intervalCount"
                  >
                    <FieldNumber
                      v-model="details.intervalCount"
                      :min="0"
                      :max="10"
                    />
                  </UFormField>
                  <UFormField
                    :label="t('core.production.fields.interval')"
                    name="intervalMinutes"
                  >
                    <DefaultedMinutes
                      v-model="details.intervalMinutes"
                      :fallback="data?.theatre.intervalMinutes"
                      :max="120"
                      :label="t('core.production.fields.interval')"
                    />
                  </UFormField>
                  <UFormField
                    :label="t('core.production.fields.capacity')"
                    name="capacity"
                  >
                    <FieldNumber
                      v-model="details.capacity"
                      class="w-48"
                      :placeholder="t('core.production.fields.capacity-placeholder')"
                      :min="1"
                    />
                  </UFormField>
                  <UFormField
                    :label="t('core.production.fields.latecomers')"
                    name="latecomers"
                    :help="t('core.production.fields.latecomers-help')"
                  >
                    <USelect
                      v-model="details.latecomers"
                      :items="latecomerItems"
                    />
                  </UFormField>
                </div>
              </FieldGroup>
              <FieldGroup :title="t('core.production.groups.public')">
                <UFormField
                  name="slug"
                  :label="t('core.production.fields.slug')"
                  :help="t('core.production.fields.slug-help')"
                >
                  <UInput
                    v-model="details.slug"
                    maxlength="60"
                  />
                </UFormField>
                <UCheckbox
                  :model-value="elsewhere"
                  :disabled="!sellsHere"
                  :label="t('core.production.fields.elsewhere')"
                  :description="sellsHere ? t('core.production.fields.elsewhere-help') : t('core.production.fields.elsewhere-always')"
                  @update:model-value="details.bookedElsewhere = !!$event"
                />
                <UFormField
                  v-if="elsewhere"
                  :label="t('core.production.fields.link')"
                  name="externalBookingUrl"
                  :required="linkNeeded"
                  :help="linkNeeded ? undefined : t('core.production.fields.link-help')"
                >
                  <UInput
                    v-model="details.externalBookingUrl"
                    type="url"
                    placeholder="https://"
                  />
                </UFormField>
                <UCheckbox
                  v-model="details.creditsPublic"
                  :label="t('core.production.fields.credits-public')"
                />
                <UCheckbox
                  v-model="details.listed"
                  :label="t('core.production.fields.listed')"
                  :description="t('core.production.fields.listed-help')"
                />
              </FieldGroup>
            </UForm>
            <template #footer>
              <UButton
                type="submit"
                form="production-details"
                :label="t('core.production.save')"
              />
            </template>
          </PageSection>
          <ProductionCollections
            :production-id="production!.id"
            :season-id="production!.seasonId"
          />
        </div>
      </template>

      <template #tab-dates>
        <div class="space-y-4">
          <RefusalNotice :refusal="refusal" />
          <ProductionPerformances
            :production-id="production!.id"
            :title="production!.title"
            :credits-public="production!.creditsPublic"
            @changed="reload()"
          />
        </div>
      </template>

      <template #tab-credits>
        <ProductionCredits
          :production-id="production!.id"
          :credits-public="production!.creditsPublic"
        />
      </template>

      <template #tab-media>
        <ProductionMedia :production-id="production!.id" />
      </template>

      <template #tab-advisories>
        <ProductionGuidance
          :production-id="production!.id"
          :production="production!"
          :options="data!.options"
          @changed="reload()"
        />
      </template>
    </PageRecord>
    <UModal
      v-if="production"
      v-model:open="publishing"
      :title="needs.length ? t('core.production.publishing.not-ready') : t('core.production.publishing.title', { title: production.title })"
      :description="needs.length ? t('core.production.publishing.not-ready-help') : t('core.production.publishing.help')"
    >
      <template #body>
        <div class="space-y-4 text-sm">
          <ul
            v-if="needs.length"
            class="list-disc space-y-1 ps-5"
          >
            <li
              v-for="n in needs"
              :key="n.key"
            >
              <ULink
                :to="n.link"
                class="underline"
                @click="publishing = false"
              >
                {{ n.sentence }}
              </ULink>
            </li>
          </ul>
          <template v-else>
            <p>
              {{ t('core.production.publishing.page-at') }}
              <ULink
                :to="publicPath"
                target="_blank"
                class="underline"
              >{{ publicPath }}</ULink>{{ t('core.production.publishing.page-at-end') }}
            </p>
            <div v-if="wanted.length">
              <p>{{ t('core.production.publishing.wanted') }}</p>
              <ul class="list-disc space-y-1 ps-5">
                <li
                  v-for="w in wanted"
                  :key="w.id"
                >
                  {{ w.sentence }}
                </li>
              </ul>
            </div>
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            :label="needs.length ? t('core.production.publishing.close') : t('core.form.cancel')"
            color="neutral"
            variant="outline"
            @click="publishing = false"
          />
          <UButton
            v-if="!needs.length"
            :label="t('core.production.publish')"
            icon="i-lucide-globe"
            loading-auto
            @click="publish()"
          />
        </div>
      </template>
    </UModal>
    <ProductionCancelDialog
      v-if="production"
      v-model:open="cancelling"
      :production-id="production.id"
      :title="production.title"
      :reasons="data?.options.reasons ?? []"
      @cancelled="reload()"
    />
  </DataBoundary>
</template>
