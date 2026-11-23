<script setup lang="ts">
// One venue (C-16, C-17): its address and public text, its spaces with kind and capacity, and the
// access features of the building and of each space. Archiving keeps the venue on the records that
// use it and takes it out of pickers and the public site.
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { spaceInput, venuePatch } from '../../../../../../server/places/input'

interface Option { id: string, label: string, icon: string | null, retired: boolean }
interface Space { id: string, name: string, kindTermId: string, defaultCapacity: number | null, doorsBeforeMinutes: number | null, runPresetId: string | null, performable: boolean, exclusive: boolean, description: string | null, accessInfo: string | null, managed: boolean, findingIt: string | null, archived: boolean }
interface Place { id: string, name: string, addressLines: string | null, locality: string | null, postcode: string | null, country: string | null }
interface Upcoming { id: string, productionId: string, title: string, space: string, startsAt: number }
interface Venue extends Place { description: string | null, accessInfo: string | null, gettingHere: string | null, archived: boolean, spaces: Space[], access: { spaceId: string | null, termId: string, note: string | null }[] }

const { t } = useT()
const { $api } = useNuxtApp()
const route = useRoute()
const base = computed(() => `/api/core/venues/${String(route.params.id)}`)
const { data, status, error, refresh } = await useAPI<{ venue: Venue, kinds: Option[], features: Option[], presets: { id: string, name: string }[], usualPreset: string | null, doorsBeforeMinutes: number, upcoming: Upcoming[], theatreCountry: string }>(base, { key: `core:venue:${String(route.params.id)}` })
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { offer } = useUndo()
const dates = useDates()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const venue = computed(() => data.value?.venue)
const liveKinds = computed(() => (data.value?.kinds ?? []).filter(k => !k.retired).map(k => ({ value: k.id, label: k.label })))
const kindLabel = (id: string) => data.value?.kinds.find(k => k.id === id)?.label ?? ''

// One call to the venue's routes. The path is built at run time, so it is typed as a string.
function api(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body: object = {}): Promise<unknown> {
  return $api<unknown>(`${base.value}${path}` as string, { method, body })
}
async function run<T>(fn: () => Promise<T>, done?: string, undo?: (result: T) => Promise<unknown>) {
  refusal.value = null
  try {
    const result = await fn()
    await refresh()
    if (done) {
      offer(done, undo && (async () => {
        await undo(result)
        await refresh()
      }))
    }
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    return false
  }
}

// Details
const details = reactive({ name: '', addressLines: '', locality: '', postcode: '', country: null as string | null, description: '', gettingHere: '', accessInfo: '' })
watch(venue, (v) => {
  if (!v) return
  Object.assign(details, {
    name: v.name, addressLines: v.addressLines ?? '', locality: v.locality ?? '', postcode: v.postcode ?? '',
    country: v.country ?? data.value?.theatreCountry ?? null, description: v.description ?? '', gettingHere: v.gettingHere ?? '', accessInfo: v.accessInfo ?? '',
  })
}, { immediate: true })
// The form hands over what the schema made of the values, which is what the route expects.
const saveDetails = (event: FormSubmitEvent<z.output<typeof venuePatch>>) => run(() => api('', 'PATCH', event.data), t('core.venue.saved'))

// A venue cannot be archived while performances still to come are in its spaces; they are listed, to be moved or cancelled first.
const blockedOpen = ref(false)
async function setArchived(archived: boolean) {
  if (archived && data.value?.upcoming.length) {
    blockedOpen.value = true
    return
  }
  if (archived && !await confirm({ verb: t('core.venue.archive'), thing: venue.value!.name, consequence: t('core.venue.archive-consequence'), button: t('core.venue.archive-venue') })) return
  await run(() => api(archived ? '/archive' : '/restore', 'POST'), archived ? t('core.venue.archived') : t('core.venue.restored'), () => api(archived ? '/restore' : '/archive', 'POST'))
}

// Spaces
// A space with no usual run preset starts from the theatre's, shown first as what "none" means.
const theatrePresetName = computed(() => data.value?.presets.find(p => p.id === data.value?.usualPreset)?.name)
const USUAL = '__usual'
const presetItems = computed(() => [{ value: USUAL, label: theatrePresetName.value ? t('core.venue.usual-preset', { name: theatrePresetName.value }) : t('core.venue.no-preset') }, ...(data.value?.presets ?? []).map(p => ({ value: p.id, label: p.name }))])
const spaceOpen = ref(false)
const spaceId = ref<string | null>(null)
// A new space has no kind until one is chosen or the name gives it away ("Studio").
const kindChosen = ref(false)
const space = reactive({ name: '', kindTermId: '', defaultCapacity: null as number | null, doorsBeforeMinutes: null as number | null, runPresetId: null as string | null, performable: true, exclusive: true, description: '', accessInfo: '', managed: true, findingIt: '' })
function openSpace(s?: Space) {
  spaceId.value = s?.id ?? null
  Object.assign(space, s
    ? { name: s.name, kindTermId: s.kindTermId, defaultCapacity: s.defaultCapacity, doorsBeforeMinutes: s.doorsBeforeMinutes, runPresetId: s.runPresetId, performable: s.performable, exclusive: s.exclusive, description: s.description ?? '', accessInfo: s.accessInfo ?? '', managed: s.managed, findingIt: s.findingIt ?? '' }
    : { name: '', kindTermId: '', defaultCapacity: null, doorsBeforeMinutes: null, runPresetId: null, performable: true, exclusive: true, description: '', accessInfo: '', managed: true, findingIt: '' })
  kindChosen.value = !!s
  refusal.value = null
  spaceOpen.value = true
}
watch(() => space.name, (name) => {
  if (spaceId.value || kindChosen.value) return
  const words = name.toLowerCase()
  space.kindTermId = (words && liveKinds.value.find(k => words.includes(k.label.toLowerCase()))?.value) || ''
})
async function saveSpace(event: FormSubmitEvent<z.output<typeof spaceInput>>) {
  const body = event.data
  // Changing who runs a space shows what other modules say it touches before it is saved (R-36).
  const before = venue.value?.spaces.find(s => s.id === spaceId.value)
  if (before && body.managed !== undefined && body.managed !== before.managed) {
    const { lines } = await $api<{ lines: string[] }>(`${base.value}/spaces/${before.id}/impact` as string, { query: { managed: String(body.managed) } })
    if (lines.length && !await confirm({ verb: t('core.venue.change'), thing: before.name, consequence: lines.join(' '), button: t('core.venue.save-space') })) return
  }
  const ok = spaceId.value
    ? await run(() => api(`/spaces/${spaceId.value}`, 'PATCH', body), t('core.venue.space-saved', { name: space.name }))
    : await run(() => $api<{ id: string }>(`${base.value}/spaces` as string, { method: 'POST', body }), t('core.venue.space-added'), ({ id }) => api(`/spaces/${id}`, 'DELETE'))
  if (ok) spaceOpen.value = false
}
async function removeSpace(s: Space) {
  if (!await confirm({ verb: t('core.venue.delete'), thing: s.name, consequence: t('core.venue.delete-consequence'), button: t('core.venue.delete-space') })) return
  await run(() => api(`/spaces/${s.id}`, 'DELETE'), t('core.venue.space-deleted', { name: s.name }))
}
const spaceActions = (s: Space) => [[
  { label: t('core.venue.edit'), icon: 'i-lucide-pencil', onSelect: () => openSpace(s) },
  s.archived
    ? { label: t('core.venue.restore'), icon: 'i-lucide-archive-restore', onSelect: () => run(() => api(`/spaces/${s.id}/restore`, 'POST'), t('core.venue.space-restored', { name: s.name }), () => api(`/spaces/${s.id}/archive`, 'POST')) }
    : { label: t('core.venue.archive'), icon: 'i-lucide-archive', onSelect: () => run(() => api(`/spaces/${s.id}/archive`, 'POST'), t('core.venue.space-archived', { name: s.name }), () => api(`/spaces/${s.id}/restore`, 'POST')) },
  ...((venue.value?.spaces.length ?? 0) > 1 ? [{ label: t('core.venue.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => removeSpace(s) }] : []),
]]

// Access features, for the whole venue or one space
const WHOLE = 'venue'
const scope = ref(WHOLE)
const scopes = computed(() => [{ value: WHOLE, label: t('core.venue.whole-venue') }, ...(venue.value?.spaces ?? []).map(s => ({ value: s.id, label: s.name }))])
const chosen = reactive<Record<string, { on: boolean, note: string }>>({})
function loadAccess() {
  const spaceId = scope.value === WHOLE ? null : scope.value
  for (const f of data.value?.features ?? []) {
    const row = venue.value?.access.find(a => a.termId === f.id && a.spaceId === spaceId)
    chosen[f.id] = { on: !!row, note: row?.note ?? '' }
  }
}
watch([venue, scope], loadAccess, { immediate: true })
const shownFeatures = computed(() => (data.value?.features ?? []).filter(f => !f.retired || chosen[f.id]?.on))
const saveAccess = () => run(() => api('/access', 'PUT', {
  spaceId: scope.value === WHOLE ? null : scope.value,
  features: shownFeatures.value.filter(f => chosen[f.id]?.on).map(f => ({ termId: f.id, note: chosen[f.id]!.note.trim() || null })),
}), t('core.venue.access-saved'))
</script>

<template>
  <PageFrame
    :title="venue?.name ?? t('core.venue.venue')"
    :trail="[{ label: t('core.venue.venues'), to: '/admin/modules/core/venues' }]"
    width="reading"
  >
    <template #status>
      <StatusBadge
        v-if="venue?.archived"
        tone="neutral"
        :label="t('core.states.archived')"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template v-if="venue">
        <RefusalNotice
          v-if="!spaceOpen"
          :refusal="refusal"
        />

        <PageSection :title="t('core.venue.details')">
          <UForm
            id="venue-details"
            :schema="venuePatch"
            :state="details"
            class="space-y-4"
            novalidate
            @submit="saveDetails"
          >
            <UFormField
              name="name"
              :label="t('core.venue.name')"
              required
            >
              <UInput
                v-model="details.name"
                maxlength="120"
              />
            </UFormField>
            <UFormField
              name="addressLines"
              :label="t('core.venue.address')"
              :hint="t('core.form.optional')"
            >
              <UTextarea
                v-model="details.addressLines"
                :rows="2"
                maxlength="300"
              />
            </UFormField>
            <div class="grid gap-4 sm:grid-cols-3">
              <UFormField
                name="locality"
                :label="t('core.venue.town-or-city')"
                :hint="t('core.form.optional')"
              >
                <UInput
                  v-model="details.locality"
                  maxlength="120"
                />
              </UFormField>
              <UFormField
                name="postcode"
                :label="t('core.venue.postcode')"
                :hint="t('core.form.optional')"
              >
                <UInput
                  v-model="details.postcode"
                  maxlength="20"
                />
              </UFormField>
              <UFormField
                name="country"
                :label="t('core.venue.country')"
                :hint="t('core.form.optional')"
              >
                <FieldCountry v-model="details.country" />
              </UFormField>
            </div>
            <UFormField
              name="description"
              :label="t('core.venue.about-the-venue')"
              :hint="t('core.form.optional')"
              :help="t('core.venue.help-shown-on-the')"
            >
              <UTextarea
                v-model="details.description"
                :rows="4"
                maxlength="4000"
              />
            </UFormField>
            <UFormField
              name="gettingHere"
              :label="t('core.venue.getting-here')"
              :hint="t('core.form.optional')"
              :help="t('core.venue.help-public-transport-parking')"
            >
              <UTextarea
                v-model="details.gettingHere"
                :rows="3"
                maxlength="4000"
              />
            </UFormField>
            <UFormField
              name="accessInfo"
              :label="t('core.venue.access')"
              :hint="t('core.form.optional')"
              :help="t('core.venue.help-what-to-expect')"
            >
              <UTextarea
                v-model="details.accessInfo"
                :rows="3"
                maxlength="4000"
              />
            </UFormField>
          </UForm>
          <template #footer>
            <UButton
              v-if="venue.archived"
              :label="t('core.venue.restore-venue')"
              color="neutral"
              variant="outline"
              icon="i-lucide-archive-restore"
              @click="setArchived(false)"
            />
            <UButton
              v-else
              :label="t('core.venue.archive-venue')"
              color="neutral"
              variant="outline"
              icon="i-lucide-archive"
              @click="setArchived(true)"
            />
            <UButton
              type="submit"
              form="venue-details"
              :label="t('core.venue.save-venue')"
            />
          </template>
        </PageSection>

        <PageSection :title="t('core.venue.spaces')">
          <template #actions>
            <UButton
              :label="t('core.venue.add-space')"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              size="sm"
              @click="openSpace()"
            />
          </template>
          <RecordList :label="t('core.venue.spaces')">
            <RecordListItem
              v-for="s in venue.spaces"
              :key="s.id"
              :name="s.name"
              :description="`${kindLabel(s.kindTermId)} · ${s.defaultCapacity ? t('core.venue.seats', { count: s.defaultCapacity }) : t('core.venue.no-capacity')}`"
              :muted="s.archived"
            >
              <StatusBadge
                v-if="!s.managed"
                tone="neutral"
                :label="t('core.venue.not-run-by-the')"
              />
              <StatusBadge
                v-if="s.archived"
                tone="neutral"
                :label="t('core.states.archived')"
              />
              <RowActions
                :items="spaceActions(s)"
                :label="t('core.venue.actions-for', { name: s.name })"
              />
            </RecordListItem>
          </RecordList>
        </PageSection>

        <PageSection
          :title="t('core.venue.access-features')"
          :description="t('core.venue.description-tick-what-the')"
        >
          <UForm
            id="venue-access"
            :state="chosen"
            class="space-y-3"
            novalidate
            @submit="saveAccess"
          >
            <UFormField
              v-if="venue.spaces.length > 1"
              :label="t('core.venue.features-of')"
            >
              <USelectMenu
                v-model="scope"
                value-key="value"
                :items="scopes"
              />
            </UFormField>
            <div
              v-for="f in shownFeatures"
              :key="f.id"
              class="flex flex-wrap items-center gap-x-3 gap-y-1"
            >
              <UCheckbox
                v-model="chosen[f.id]!.on"
                :label="f.label"
                class="max-sm:basis-full sm:w-56"
              />
              <UInput
                v-if="chosen[f.id]!.on"
                v-model="chosen[f.id]!.note"
                :placeholder="t('core.venue.placeholder-note-such-as')"
                :aria-label="t('core.venue.note-on', { feature: f.label })"
                maxlength="200"
                size="sm"
                class="flex-1 max-sm:ms-6"
              />
            </div>
          </UForm>
          <template #footer>
            <UButton
              type="submit"
              form="venue-access"
              :label="t('core.venue.save-access-features')"
            />
          </template>
        </PageSection>
      </template>
    </DataBoundary>

    <UModal
      v-model:open="blockedOpen"
      :title="t('core.venue.blocked', { name: venue?.name ?? t('core.venue.this-venue') })"
      :description="t('core.venue.description-performances-still-to')"
    >
      <template #body>
        <RecordList :label="t('core.venue.upcoming')">
          <RecordListItem
            v-for="p in data?.upcoming"
            :key="p.id"
            :to="`/console/programme/productions/${p.productionId}`"
            :name="p.title"
            :description="`${dates.dateTime(p.startsAt)} · ${p.space}`"
          />
        </RecordList>
      </template>
      <template #footer>
        <UButton
          :label="t('core.venue.close')"
          color="neutral"
          variant="outline"
          @click="blockedOpen = false"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="spaceOpen"
      :title="spaceId ? t('core.venue.edit-space') : t('core.venue.add-space')"
    >
      <template #body>
        <UForm
          id="space-form"
          :schema="spaceInput"
          :state="space"
          class="space-y-4"
          novalidate
          @submit="saveSpace"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="name"
            :label="t('core.venue.name')"
            required
          >
            <UInput
              v-model="space.name"
              maxlength="120"
            />
          </UFormField>
          <UFormField
            name="kindTermId"
            :label="t('core.venue.kind')"
            required
          >
            <USelectMenu
              v-model="space.kindTermId"
              value-key="value"
              :items="liveKinds"
              :placeholder="t('core.venue.choose-a-kind')"
              @update:model-value="kindChosen = true"
            />
          </UFormField>
          <UFormField
            name="defaultCapacity"
            :label="t('core.venue.usual-capacity')"
            :hint="t('core.form.optional')"
            :help="t('core.venue.help-box-office-and')"
          >
            <FieldNumber
              v-model="space.defaultCapacity"
              :min="1"
              :increment="false"
              :decrement="false"
              :placeholder="t('core.venue.not-set')"
            />
          </UFormField>
          <UCheckbox
            v-model="space.performable"
            name="performable"
            :label="t('core.venue.performances-can-happen-here')"
          />
          <div
            v-if="space.performable"
            class="grid gap-4 sm:grid-cols-2"
          >
            <UFormField
              name="doorsBeforeMinutes"
              :label="t('core.venue.doors-open-before')"
            >
              <MinutesInput
                v-model="space.doorsBeforeMinutes"
                :placeholder="data?.doorsBeforeMinutes"
                :max="180"
                :label="t('core.venue.doors-open-before')"
              />
            </UFormField>
            <UFormField
              name="runPresetId"
              :label="t('core.venue.usual-run-preset')"
              :help="t('core.venue.help-what-add-a')"
            >
              <USelectMenu
                :model-value="space.runPresetId ?? USUAL"
                value-key="value"
                :items="presetItems"
                @update:model-value="space.runPresetId = $event === USUAL ? null : String($event)"
              />
            </UFormField>
          </div>
          <UCheckbox
            v-model="space.exclusive"
            name="exclusive"
            :label="t('core.venue.one-thing-at-a')"
            :description="t('core.venue.description-untick-for-a')"
          />
          <UCheckbox
            v-model="space.managed"
            name="managed"
            :label="t('core.venue.the-theatre-runs-this')"
            :description="t('core.venue.description-untick-for-a-2')"
          />
          <UFormField
            name="findingIt"
            :label="t('core.venue.finding-it')"
            :hint="t('core.form.optional')"
            :help="t('core.venue.help-a-short-note')"
          >
            <UInput
              v-model="space.findingIt"
              maxlength="200"
            />
          </UFormField>
          <UFormField
            name="accessInfo"
            :label="t('core.venue.access')"
            :hint="t('core.form.optional')"
          >
            <UTextarea
              v-model="space.accessInfo"
              :rows="2"
              maxlength="4000"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="space-form"
          :label="spaceId ? t('core.venue.save-space') : t('core.venue.add-space')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
