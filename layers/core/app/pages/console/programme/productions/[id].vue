<script setup lang="ts">
// One production (C-02, C-03): its details, performances, advisories and web address, with publish,
// withdraw, cancel (and bring back) and delete. Publishing names what is still missing. Credits and
// media arrive with their slices.

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
  ageGuidance: string | null
  advisoriesConfirmedNone: boolean
  contentNote: string | null
  runningMinutes: number | null
  intervalCount: number
  externalBookingUrl: string | null
  creditsPublic: boolean
  listed: boolean
  state: State
  publishedAt: number | null
  advisories: { termId: string, detail: string | null }[]
}
interface Answer { production: Production, needs: string[], options: { categories: Option[], advisories: Option[], reasons: Option[], seasons: { id: string, name: string }[] } }

const { $api } = useNuxtApp()
const route = useRoute()
const base = computed(() => `/api/core/productions/${String(route.params.id)}`)
const { data, status, error, refresh } = await useAPI<Answer>(base, { key: `core:production:${String(route.params.id)}` })
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const production = computed(() => data.value?.production)

function api(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body: object = {}): Promise<unknown> {
  return $api<unknown>(`${base.value}${path}` as string, { method, body })
}
async function run(fn: () => Promise<unknown>, done?: string) {
  refusal.value = null
  try {
    await fn()
    await refresh()
    if (done) toast.add({ title: done, color: 'success' })
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    return false
  }
}

const KINDS = [{ value: 'own', label: 'Our own production' }, { value: 'visiting', label: 'A visiting company' }, { value: 'hire', label: 'A hire' }, { value: 'event', label: 'An event' }]
const NONE = '__none'
const TONES = { draft: 'neutral', published: 'success', withdrawn: 'warning', cancelled: 'danger' } as const
const categories = computed(() => (data.value?.options.categories ?? []).filter(c => !c.retired || c.id === production.value?.categoryTermId).map(c => ({ value: c.id, label: c.label })))
const seasons = computed(() => [{ value: NONE, label: 'No season' }, ...(data.value?.options.seasons ?? []).map(s => ({ value: s.id, label: s.name }))])

// Details
const details = reactive({
  title: '', slug: '', subtitle: '', summary: '', description: '', kind: 'own' as Production['kind'], categoryTermId: '', seasonId: NONE, companyName: '',
  ageGuidance: '', contentNote: '', runningMinutes: null as number | null, intervalCount: 0, externalBookingUrl: '', creditsPublic: true, listed: true,
})
watch(production, (p) => {
  if (!p) return
  Object.assign(details, {
    title: p.title, slug: p.slug, subtitle: p.subtitle ?? '', summary: p.summary ?? '', description: p.description ?? '', kind: p.kind, categoryTermId: p.categoryTermId ?? '',
    seasonId: p.seasonId ?? NONE, companyName: p.companyName ?? '', ageGuidance: p.ageGuidance ?? '', contentNote: p.contentNote ?? '', runningMinutes: p.runningMinutes,
    intervalCount: p.intervalCount, externalBookingUrl: p.externalBookingUrl ?? '', creditsPublic: p.creditsPublic, listed: p.listed,
  })
}, { immediate: true })
const saveDetails = () => run(() => api('', 'PATCH', {
  ...details,
  categoryTermId: details.categoryTermId || null,
  seasonId: details.seasonId === NONE ? null : details.seasonId,
  externalBookingUrl: details.externalBookingUrl.trim() || null,
  runningMinutes: details.runningMinutes || null,
}), 'Production saved')

// Advisories
const chosen = reactive<Record<string, { on: boolean, detail: string }>>({})
const confirmedNone = ref(false)
watch(data, (d) => {
  if (!d) return
  for (const a of d.options.advisories) {
    const row = d.production.advisories.find(x => x.termId === a.id)
    chosen[a.id] = { on: !!row, detail: row?.detail ?? '' }
  }
  confirmedNone.value = d.production.advisoriesConfirmedNone
}, { immediate: true })
const shownAdvisories = computed(() => (data.value?.options.advisories ?? []).filter(a => !a.retired || chosen[a.id]?.on))
const anyChosen = computed(() => shownAdvisories.value.some(a => chosen[a.id]?.on))
async function saveAdvisories() {
  const list = shownAdvisories.value.filter(a => chosen[a.id]?.on).map(a => ({ termId: a.id, detail: chosen[a.id]!.detail.trim() || null }))
  if (!list.length && confirmedNone.value !== production.value?.advisoriesConfirmedNone)
    return run(() => api('', 'PATCH', { advisoriesConfirmedNone: confirmedNone.value }), 'Advisories saved')
  return run(() => api('/advisories', 'PUT', { advisories: list }), 'Advisories saved')
}

// Moves
const publish = () => run(() => api('/publish', 'POST'), 'Production published')
async function withdraw() {
  if (!await confirm({ verb: 'Withdraw', thing: production.value!.title, consequence: 'It leaves the public site, with its dates, until you publish it again.', button: 'Withdraw' })) return
  await run(() => api('/withdraw', 'POST'), 'Production withdrawn')
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
</script>

<template>
  <PageFrame
    :title="production?.title ?? 'Production'"
    :trail="[{ label: 'Productions', to: '/console/programme/productions' }]"
    width="reading"
  >
    <template #status>
      <StatusBadge
        v-if="production"
        :tone="TONES[production.state]"
        :label="production.state.charAt(0).toUpperCase() + production.state.slice(1)"
      />
    </template>
    <template #primary>
      <div
        v-if="production"
        class="flex flex-wrap gap-2"
      >
        <UButton
          v-if="production.state === 'draft' || production.state === 'withdrawn'"
          label="Publish"
          icon="i-lucide-globe"
          @click="publish"
        />
        <UButton
          v-if="production.state === 'published'"
          label="Withdraw"
          color="neutral"
          variant="outline"
          @click="withdraw"
        />
        <UButton
          v-if="production.state === 'published' || production.state === 'withdrawn'"
          label="Cancel production"
          color="error"
          variant="outline"
          icon="i-lucide-calendar-x"
          @click="cancelling = true"
        />
        <UButton
          v-if="production.state === 'cancelled'"
          label="Bring back"
          color="neutral"
          variant="outline"
          icon="i-lucide-undo-2"
          @click="restore"
        />
        <UButton
          v-if="production.state === 'draft' && !production.publishedAt"
          label="Delete"
          color="error"
          variant="ghost"
          icon="i-lucide-trash-2"
          @click="remove"
        />
      </div>
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="production"
        class="space-y-4"
      >
        <RefusalNotice :refusal="refusal" />
        <UAlert
          v-if="data!.needs.length && production.state !== 'published'"
          color="info"
          icon="i-lucide-info"
          :title="`To publish, this production needs ${data!.needs.join(', ')}.`"
        />

        <PageSection title="Details">
          <UForm
            id="production-details"
            :state="details"
            class="space-y-4"
            @submit="saveDetails"
          >
            <UFormField
              label="Title"
              required
            >
              <UInput
                v-model="details.title"
                maxlength="200"
              />
            </UFormField>
            <UFormField label="Subtitle">
              <UInput
                v-model="details.subtitle"
                maxlength="200"
              />
            </UFormField>
            <UFormField
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
              label="About the production"
              help="Shown on its public page. Markdown is allowed."
            >
              <UTextarea
                v-model="details.description"
                :rows="6"
                maxlength="20000"
              />
            </UFormField>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="What it is">
                <USelect
                  v-model="details.kind"
                  :items="KINDS"
                />
              </UFormField>
              <UFormField
                label="Category"
                help="Needed to publish."
              >
                <USelect
                  v-model="details.categoryTermId"
                  :items="categories"
                  placeholder="Choose a category"
                />
              </UFormField>
              <UFormField label="Season">
                <USelect
                  v-model="details.seasonId"
                  :items="seasons"
                />
              </UFormField>
              <UFormField
                v-if="details.kind !== 'own'"
                label="Company"
              >
                <UInput
                  v-model="details.companyName"
                  maxlength="200"
                />
              </UFormField>
              <UFormField label="Running time in minutes">
                <UInputNumber
                  v-model="details.runningMinutes"
                  :min="1"
                />
              </UFormField>
              <UFormField label="Intervals">
                <UInputNumber
                  v-model="details.intervalCount"
                  :min="0"
                  :max="10"
                />
              </UFormField>
              <UFormField
                label="Age guidance"
                help="Such as 12+."
              >
                <UInput
                  v-model="details.ageGuidance"
                  maxlength="40"
                />
              </UFormField>
              <UFormField
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
              label="Booking link"
              help="Used when no booking module sells this production. Must start https://."
            >
              <UInput
                v-model="details.externalBookingUrl"
                type="url"
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
              :disabled="!details.title.trim()"
            />
          </template>
        </PageSection>

        <ProductionPerformances
          :production-id="production!.id"
          :title="production!.title"
          :interval-count="production!.intervalCount"
          @changed="refresh()"
        />

        <PageSection
          title="Advisories"
          description="List what people may want to know before they come, or confirm there is nothing. Publishing needs one or the other, so silence is never taken for &quot;nothing to warn about&quot;."
        >
          <UForm
            id="production-advisories"
            :state="chosen"
            class="space-y-3"
            @submit="saveAdvisories"
          >
            <div
              v-for="a in shownAdvisories"
              :key="a.id"
              class="flex flex-wrap items-center gap-3"
            >
              <UCheckbox
                v-model="chosen[a.id]!.on"
                :label="a.label"
                class="w-56"
              />
              <UInput
                v-if="chosen[a.id]!.on"
                v-model="chosen[a.id]!.detail"
                placeholder="Detail, such as when it happens"
                :aria-label="`Detail for ${a.label}`"
                maxlength="300"
                size="sm"
                class="flex-1"
              />
            </div>
            <UCheckbox
              v-if="!anyChosen"
              v-model="confirmedNone"
              label="This production has no advisories"
            />
          </UForm>
          <template #footer>
            <UButton
              type="submit"
              form="production-advisories"
              label="Save advisories"
              color="neutral"
              variant="outline"
            />
          </template>
        </PageSection>
      </div>
    </DataBoundary>
    <ProductionCancelDialog
      v-if="production"
      v-model:open="cancelling"
      :production-id="production.id"
      :title="production.title"
      :reasons="data?.options.reasons ?? []"
      @cancelled="refresh()"
    />
  </PageFrame>
</template>
