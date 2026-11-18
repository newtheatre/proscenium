<script setup lang="ts">
// One production (C-02, C-03, C-09, C-23, C-24) as a record page (UI-12): tabs for its overview,
// details, dates, credits, media and guidance (age, effects, content warnings), a facts strip, and a side panel that stays beside
// every tab with the poster, managed in place, and what publishing still needs. Publishing asks
// first, showing where it will appear, or what is still to do; once published the side panel says so.
import type { DropdownMenuItem } from '@nuxt/ui'
import { z } from 'zod'
import { productionPatch } from '../../../../../server/programme/input'
import { blankAsNull } from '../../../../../shared/validation'

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
  creditsPublic: boolean
  listed: boolean
  state: State
  publishedAt: number | null
  advisories: { termId: string, level: 'mentioned' | 'discussed' | 'depicted', levelAssumed: boolean, detail: string | null }[]
  effects: { termId: string, detail: string | null }[]
}
interface Need { key: string, sentence: string, link: string }
interface Answer { production: Production, needs: Need[], theatre: { runningMinutes: number, doorsBeforeMinutes: number, intervalMinutes: number }, sellsHere: boolean, options: { categories: Option[], advisories: { id: string, label: string, description: string | null, groupId: string | null, retired: boolean }[], advisoryGroups: { id: string, label: string }[], effects: { id: string, label: string, description: string | null, icon: string | null, retired: boolean }[], reasons: Option[], seasons: { id: string, name: string }[] } }

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

const KINDS = [{ value: 'own', label: 'Our own production' }, { value: 'visiting', label: 'A visiting company' }, { value: 'hire', label: 'A hire' }, { value: 'event', label: 'An event' }]
const NONE = '__none'
const TONES = { draft: 'neutral', published: 'success', withdrawn: 'warning', cancelled: 'danger' } as const
const STATE_TONES = { scheduled: 'success', draft: 'neutral', cancelled: 'danger', completed: 'neutral' } as const
const categories = computed(() => (data.value?.options.categories ?? []).filter(c => !c.retired || c.id === production.value?.categoryTermId).map(c => ({ value: c.id, label: c.label })))
const seasons = computed(() => [{ value: NONE, label: 'No season' }, ...(data.value?.options.seasons ?? []).map(s => ({ value: s.id, label: s.name }))])

// Details
const details = reactive({
  title: '', slug: '', subtitle: '', summary: '', description: '', kind: 'own' as Production['kind'], categoryTermId: '', seasonId: NONE, companyName: '',
  contentNote: '', runningMinutes: null as number | null, intervalCount: 0, intervalMinutes: null as number | null, doorsBeforeMinutes: null as number | null,
  capacity: null as number | null, bookedElsewhere: false, externalBookingUrl: '', creditsPublic: true, listed: true,
})
// With nothing here selling tickets, every production is booked elsewhere (Matt, 2026-11-17).
const sellsHere = computed(() => data.value?.sellsHere ?? true)
const elsewhere = computed(() => !sellsHere.value || details.bookedElsewhere)
// Checked as it will be sent, with the schema the route uses. A production ticked as booked elsewhere
// needs its link; with nothing here selling tickets a draft saves without one, and only publishing
// (and a published production) needs it.
const linkNeeded = computed(() => elsewhere.value && (sellsHere.value || production.value?.state === 'published'))
const detailsForm = useTemplateRef('detailsForm')
const detailsSchema = computed(() => linkNeeded.value
  ? blankAsNull(productionPatch.extend({ externalBookingUrl: productionPatch.shape.externalBookingUrl.unwrap().unwrap() }))
  : elsewhere.value
    ? blankAsNull(productionPatch)
    : z.preprocess(v => ({ ...(v as object), externalBookingUrl: null }), blankAsNull(productionPatch)))
// What an empty length stands for, said beside the field rather than only greyed inside it.
const inherited = (own: number | null, theatre: number | undefined) => own === null && theatre !== undefined ? `${minutesInWords(theatre)} (theatre default)` : undefined
const detailsFrom = (p: Production) => ({
  title: p.title, slug: p.slug, subtitle: p.subtitle ?? '', summary: p.summary ?? '', description: p.description ?? '', kind: p.kind, categoryTermId: p.categoryTermId ?? '',
  seasonId: p.seasonId ?? NONE, companyName: p.companyName ?? '', contentNote: p.contentNote ?? '', runningMinutes: p.runningMinutes,
  intervalCount: p.intervalCount, intervalMinutes: p.intervalMinutes, doorsBeforeMinutes: p.doorsBeforeMinutes, capacity: p.capacity,
  bookedElsewhere: !!p.externalBookingUrl, externalBookingUrl: p.externalBookingUrl ?? '', creditsPublic: p.creditsPublic, listed: p.listed,
})
const resetDetails = () => production.value && Object.assign(details, detailsFrom(production.value))
watch(production, resetDetails, { immediate: true })
// Leaving the Details tab, or the page, with changes asks first; leaving drops them.
const detailsDirty = computed(() => !!production.value && JSON.stringify({ ...details }) !== JSON.stringify(detailsFrom(production.value)))
useLeaveGuard(detailsDirty, { query: ['tab'], thing: 'this tab', discard: resetDetails })
const saveDetails = () => run(() => api('', 'PATCH', {
  ...(({ bookedElsewhere: _, ...rest }) => rest)(details),
  categoryTermId: details.categoryTermId || null,
  seasonId: details.seasonId === NONE ? null : details.seasonId,
  externalBookingUrl: elsewhere.value ? details.externalBookingUrl.trim() || null : null,
  runningMinutes: details.runningMinutes || null,
}), 'Production saved', detailsForm.value)

// Moves. Publishing opens a window first: what is still to do, or where the page will appear.
const needs = computed(() => data.value?.needs ?? [])
const publicPath = computed(() => `/whats-on/${production.value?.slug ?? ''}`)
const publishing = ref(false)
const publishBusy = ref(false)
const { data: checkList } = useNuxtData<{ checks: { id: string, done: boolean, sentence: string, needed?: boolean }[] }>(`core:record-checks:core.production:${String(route.params.id)}`)
const wanted = computed(() => (checkList.value?.checks ?? []).filter(c => c.needed === false && !c.done))
async function publish() {
  publishBusy.value = true
  const done = await run(() => api('/publish', 'POST'))
  publishBusy.value = false
  // Something changed since the page was read: the window shows the list as it is now, in place of the refusal.
  if (!done && refusal.value?.code === 'core.production.not-ready') {
    refusal.value = null
    await reload()
    return
  }
  publishing.value = false
  if (!done) return
  say({
    title: 'Production published',
    duration: 10_000, // not-policy: the ten seconds Undo is offered for
    actions: [
      { label: 'View public page', icon: 'i-lucide-external-link', color: 'neutral', variant: 'outline', to: publicPath.value, target: '_blank' },
      { label: t('core.undo.button'), icon: 'i-lucide-undo-2', color: 'neutral', variant: 'outline', onClick: () => { void run(() => api('/withdraw', 'POST'), 'Production withdrawn') } },
    ],
  })
}
async function withdraw() {
  if (!await confirm({ verb: 'Withdraw', thing: production.value!.title, consequence: 'It leaves the public site, with its dates, until you publish it again.', button: 'Withdraw' })) return
  await run(() => api('/withdraw', 'POST'), 'Production withdrawn')
}
async function duplicate() {
  refusal.value = null
  try {
    const { id } = await $api<{ id: string }>(`${base.value}/duplicate` as string, { method: 'POST', body: {} })
    say({ title: 'Production duplicated', description: 'Its dates, credits and images were not copied.' })
    await navigateTo(`/console/programme/productions/${id}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const cancelling = ref(false)
async function restore() {
  if (!await confirm({ verb: 'Bring back', thing: production.value!.title, consequence: 'It becomes withdrawn, so you can publish it again. Its performances stay cancelled until you reinstate each one.', button: 'Bring back' })) return
  await run(() => api('/restore', 'POST'), 'Production brought back')
}
async function remove() {
  if (!await confirm({ verb: 'Delete', thing: production.value!.title, consequence: 'The draft is removed for good.', button: 'Delete production' })) return
  if (await run(() => api('', 'DELETE'))) await navigateTo('/console/programme/productions')
}

// The page: one likely next step for the state, the rest in the menu with the destructive last.
const primary = computed(() => {
  const state = production.value?.state
  if (state === 'draft' || state === 'withdrawn') {
    const n = needs.value.length
    return { label: state === 'draft' ? 'Publish' : 'Publish again', icon: 'i-lucide-globe', hint: n ? `${n} ${n === 1 ? 'thing' : 'things'} to do before it can be published` : undefined }
  }
  if (state === 'cancelled') return { label: 'Bring back', icon: 'i-lucide-undo-2' }
  return undefined
})
function onPrimary() {
  if (production.value?.state === 'cancelled') return restore()
  publishing.value = true
}
const actions = computed<DropdownMenuItem[][]>(() => {
  const p = production.value
  if (!p) return []
  const groups: DropdownMenuItem[][] = [[{ label: 'Duplicate', icon: 'i-lucide-copy', onSelect: () => { void duplicate() } }]]
  if (p.state === 'published') groups[0]!.push({ label: 'Withdraw', icon: 'i-lucide-eye-off', onSelect: () => { void withdraw() } })
  const destructive: DropdownMenuItem[] = []
  if (p.state === 'published' || p.state === 'withdrawn') destructive.push({ label: 'Cancel production', icon: 'i-lucide-calendar-x', color: 'error', onSelect: () => { cancelling.value = true } })
  if (p.state === 'draft' && !p.publishedAt) destructive.push({ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { void remove() } })
  if (destructive.length) groups.push(destructive)
  return groups
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
    { label: 'Run', value: first && last ? span(first.startsAt, last.startsAt) : 'No dates yet' },
    // The venue only when the run plays in more than one.
    { label: 'Next performance', value: next ? (oneVenue.value ? dateTime(next.startsAt) : `${dateTime(next.startsAt)}, ${venueName(next.venueId)}`) : 'None to come' },
    { label: 'Season', value: data.value?.options.seasons.find(s => s.id === p.seasonId)?.name ?? 'None' },
    { label: 'Performances', value: cancelled ? `${running.value.length}, and ${cancelled} cancelled` : String(running.value.length) },
  ]
})
const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'details', label: 'Details' },
  { id: 'dates', label: 'Dates' },
  { id: 'credits', label: 'Credits' },
  { id: 'media', label: 'Media' },
  { id: 'advisories', label: 'Age, effects and warnings' },
]
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
      :trail="[{ label: 'Productions', to: '/console/programme/productions' }]"
      checklist-title="Ready to publish?"
      :checklist="production.state === 'draft' || production.state === 'withdrawn'"
      @primary="onPrimary"
    >
      <template #aside>
        <ProductionPoster :production-id="production.id" />
        <section
          v-if="production.state === 'published'"
          aria-labelledby="published-heading"
          class="space-y-3 rounded-lg border border-default p-4"
        >
          <h2
            id="published-heading"
            class="text-sm font-semibold text-highlighted"
          >
            Published
          </h2>
          <p
            v-if="production.publishedAt"
            class="text-sm"
          >
            First published on {{ day(production.publishedAt) }}.
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              label="View public page"
              icon="i-lucide-external-link"
              color="neutral"
              variant="outline"
              size="sm"
              :to="publicPath"
              target="_blank"
            />
            <UButton
              label="Withdraw"
              icon="i-lucide-eye-off"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="withdraw()"
            />
          </div>
        </section>
      </template>

      <template #tab-overview>
        <div class="space-y-4">
          <RefusalNotice :refusal="refusal" />
          <PageSection title="About">
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
              No summary yet. Add one on the Details tab: lists and search results show it.
            </p>
          </PageSection>
          <PageSection
            title="Coming up"
            :description="comingUp.length ? undefined : 'No scheduled performances to come.'"
          >
            <RecordList
              v-if="comingUp.length"
              label="Coming up"
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
                :label="performances.length ? `All dates (${performances.length})` : 'Add dates'"
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
          <PageSection title="Details">
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
                label="Title"
                required
              >
                <UInput
                  v-model="details.title"
                  maxlength="200"
                />
              </UFormField>
              <UFormField
                name="subtitle"
                label="Subtitle"
              >
                <UInput
                  v-model="details.subtitle"
                  maxlength="200"
                />
              </UFormField>
              <UFormField
                name="summary"
                label="Summary"
                help="One or two sentences for lists and search results. Needed to publish."
              >
                <UTextarea
                  v-model="details.summary"
                  :rows="2"
                  maxlength="300"
                />
              </UFormField>
              <UFormField
                name="description"
                label="About the production"
                help="Shown on its public page. You can use **bold**, *italic*, lists, headings and links that start with https."
              >
                <UTextarea
                  v-model="details.description"
                  :rows="6"
                  maxlength="20000"
                />
              </UFormField>
              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField
                  name="kind"
                  label="What it is"
                >
                  <USelect
                    v-model="details.kind"
                    :items="KINDS"
                  />
                </UFormField>
                <UFormField
                  name="categoryTermId"
                  label="Category"
                  help="Needed to publish."
                >
                  <USelectMenu
                    v-model="details.categoryTermId"
                    value-key="value"
                    :items="categories"
                    placeholder="Choose a category"
                  />
                </UFormField>
                <UFormField
                  name="seasonId"
                  label="Season"
                >
                  <USelectMenu
                    v-model="details.seasonId"
                    value-key="value"
                    :items="seasons"
                  />
                </UFormField>
                <UFormField
                  v-if="details.kind !== 'own'"
                  name="companyName"
                  label="Company"
                >
                  <UInput
                    v-model="details.companyName"
                    maxlength="200"
                  />
                </UFormField>
                <UFormField
                  label="Running time"
                  help="Including the intervals."
                  name="runningMinutes"
                  :hint="inherited(details.runningMinutes, data?.theatre.runningMinutes)"
                >
                  <MinutesInput
                    v-model="details.runningMinutes"
                    :placeholder="data?.theatre.runningMinutes"
                    :min="1"
                    label="Running time"
                  />
                </UFormField>
                <UFormField
                  label="Doors open before"
                  name="doorsBeforeMinutes"
                  :hint="inherited(details.doorsBeforeMinutes, data?.theatre.doorsBeforeMinutes)"
                >
                  <MinutesInput
                    v-model="details.doorsBeforeMinutes"
                    :placeholder="data?.theatre.doorsBeforeMinutes"
                    :max="180"
                    label="Doors open before"
                  />
                </UFormField>
                <UFormField
                  label="Intervals"
                  name="intervalCount"
                >
                  <UInputNumber
                    v-model="details.intervalCount"
                    :min="0"
                    :max="10"
                  />
                </UFormField>
                <UFormField
                  label="Each interval"
                  name="intervalMinutes"
                  :hint="inherited(details.intervalMinutes, data?.theatre.intervalMinutes)"
                >
                  <MinutesInput
                    v-model="details.intervalMinutes"
                    :placeholder="data?.theatre.intervalMinutes"
                    :max="120"
                    label="Each interval"
                  />
                </UFormField>
                <UFormField
                  label="Capacity"
                  name="capacity"
                >
                  <UInputNumber
                    v-model="details.capacity"
                    placeholder="Each space's own"
                    :min="1"
                  />
                </UFormField>
                <UCheckbox
                  :model-value="elsewhere"
                  :disabled="!sellsHere"
                  label="Booked elsewhere"
                  :description="sellsHere ? 'Tickets are sold on another website, not here.' : 'Nothing here sells tickets, so every production is booked on another website.'"
                  @update:model-value="details.bookedElsewhere = !!$event"
                />
                <UFormField
                  name="slug"
                  label="Web address"
                  help="An old address keeps working once the production has been public."
                >
                  <UInput
                    v-model="details.slug"
                    maxlength="60"
                  />
                </UFormField>
              </div>
              <UFormField
                v-if="elsewhere"
                label="Booking link"
                name="externalBookingUrl"
                :required="linkNeeded"
                :help="linkNeeded ? undefined : 'Needed to publish. You can save the draft without it.'"
              >
                <UInput
                  v-model="details.externalBookingUrl"
                  type="url"
                  placeholder="https://"
                />
              </UFormField>
              <UCheckbox
                v-model="details.creditsPublic"
                label="Show the cast and crew on the public page"
              />
              <UCheckbox
                v-model="details.listed"
                label="List it on what's on"
                description="Turn off to keep a published production out of lists and feeds while its own page still answers."
              />
            </UForm>
            <template #footer>
              <UButton
                type="submit"
                form="production-details"
                label="Save production"
              />
            </template>
          </PageSection>
        </div>
      </template>

      <template #tab-dates>
        <div class="space-y-4">
          <RefusalNotice :refusal="refusal" />
          <ProductionPerformances
            :production-id="production!.id"
            :title="production!.title"
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
      :title="needs.length ? 'Not ready to publish yet' : `Publish ${production.title}?`"
      :description="needs.length ? 'Publishing needs these first. Each link opens the place to put it right.' : 'It goes on the public site, where anyone can see it.'"
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
              Its page will be at
              <ULink
                :to="publicPath"
                target="_blank"
                class="underline"
              >{{ publicPath }}</ULink>,
              with its scheduled dates.
            </p>
            <div v-if="wanted.length">
              <p>Not done yet, though it can be published without:</p>
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
            :label="needs.length ? 'Close' : 'Cancel'"
            color="neutral"
            variant="outline"
            @click="publishing = false"
          />
          <UButton
            v-if="!needs.length"
            label="Publish"
            icon="i-lucide-globe"
            :loading="publishBusy"
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
