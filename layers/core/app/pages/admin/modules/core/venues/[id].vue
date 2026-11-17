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
interface Venue extends Place { description: string | null, accessInfo: string | null, gettingHere: string | null, archived: boolean, spaces: Space[], access: { spaceId: string | null, termId: string, note: string | null }[] }

const { $api } = useNuxtApp()
const route = useRoute()
const base = computed(() => `/api/core/venues/${String(route.params.id)}`)
const { data, status, error, refresh } = await useAPI<{ venue: Venue, kinds: Option[], features: Option[], presets: { id: string, name: string }[], usualPreset: string | null, doorsBeforeMinutes: number }>(base, { key: `core:venue:${String(route.params.id)}` })
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const venue = computed(() => data.value?.venue)
const liveKinds = computed(() => (data.value?.kinds ?? []).filter(k => !k.retired).map(k => ({ value: k.id, label: k.label })))
const kindLabel = (id: string) => data.value?.kinds.find(k => k.id === id)?.label ?? ''

// One call to the venue's routes. The path is built at run time, so it is typed as a string.
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

// Details
const details = reactive({ name: '', addressLines: '', locality: '', postcode: '', country: null as string | null, description: '', gettingHere: '', accessInfo: '' })
watch(venue, (v) => {
  if (!v) return
  Object.assign(details, {
    name: v.name, addressLines: v.addressLines ?? '', locality: v.locality ?? '', postcode: v.postcode ?? '',
    country: v.country, description: v.description ?? '', gettingHere: v.gettingHere ?? '', accessInfo: v.accessInfo ?? '',
  })
}, { immediate: true })
// The form hands over what the schema made of the values, which is what the route expects.
const saveDetails = (event: FormSubmitEvent<z.output<typeof venuePatch>>) => run(() => api('', 'PATCH', event.data), 'Venue saved')

async function setArchived(archived: boolean) {
  if (archived && !await confirm({ verb: 'Archive', thing: venue.value!.name, consequence: 'It leaves every picker and the public site. Records that use it keep it, and you can restore it later.', button: 'Archive venue' })) return
  await run(() => api(archived ? '/archive' : '/restore', 'POST'), archived ? 'Venue archived' : 'Venue restored')
}

// Spaces
// A space with no usual run preset starts from the theatre's, shown first as what "none" means.
const theatrePresetName = computed(() => data.value?.presets.find(p => p.id === data.value?.usualPreset)?.name)
const USUAL = '__usual'
const presetItems = computed(() => [{ value: USUAL, label: theatrePresetName.value ? `The theatre's usual (${theatrePresetName.value})` : 'None' }, ...(data.value?.presets ?? []).map(p => ({ value: p.id, label: p.name }))])
const spaceOpen = ref(false)
const spaceId = ref<string | null>(null)
const space = reactive({ name: '', kindTermId: '', defaultCapacity: null as number | null, doorsBeforeMinutes: null as number | null, runPresetId: null as string | null, performable: true, exclusive: true, description: '', accessInfo: '', managed: true, findingIt: '' })
function openSpace(s?: Space) {
  spaceId.value = s?.id ?? null
  Object.assign(space, s
    ? { name: s.name, kindTermId: s.kindTermId, defaultCapacity: s.defaultCapacity, doorsBeforeMinutes: s.doorsBeforeMinutes, runPresetId: s.runPresetId, performable: s.performable, exclusive: s.exclusive, description: s.description ?? '', accessInfo: s.accessInfo ?? '', managed: s.managed, findingIt: s.findingIt ?? '' }
    : { name: '', kindTermId: liveKinds.value[0]?.value ?? '', defaultCapacity: null, doorsBeforeMinutes: null, runPresetId: null, performable: true, exclusive: true, description: '', accessInfo: '', managed: true, findingIt: '' })
  refusal.value = null
  spaceOpen.value = true
}
async function saveSpace(event: FormSubmitEvent<z.output<typeof spaceInput>>) {
  const body = event.data
  // Changing who runs a space shows what other modules say it touches before it is saved (R-36).
  const before = venue.value?.spaces.find(s => s.id === spaceId.value)
  if (before && body.managed !== undefined && body.managed !== before.managed) {
    const { lines } = await $api<{ lines: string[] }>(`${base.value}/spaces/${before.id}/impact` as string, { query: { managed: String(body.managed) } })
    if (lines.length && !await confirm({ verb: 'Change', thing: before.name, consequence: lines.join(' '), button: 'Save space' })) return
  }
  const ok = spaceId.value
    ? await run(() => api(`/spaces/${spaceId.value}`, 'PATCH', body), `Saved ${space.name}`)
    : await run(() => api('/spaces', 'POST', body), `Added ${space.name}`)
  if (ok) spaceOpen.value = false
}
async function removeSpace(s: Space) {
  if (!await confirm({ verb: 'Delete', thing: s.name, consequence: 'The space and its access features are removed. This cannot be undone.', button: 'Delete space' })) return
  await run(() => api(`/spaces/${s.id}`, 'DELETE'), `Deleted ${s.name}`)
}
const spaceActions = (s: Space) => [[
  { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openSpace(s) },
  s.archived
    ? { label: 'Restore', icon: 'i-lucide-archive-restore', onSelect: () => run(() => api(`/spaces/${s.id}/restore`, 'POST'), `Restored ${s.name}`) }
    : { label: 'Archive', icon: 'i-lucide-archive', onSelect: () => run(() => api(`/spaces/${s.id}/archive`, 'POST'), `Archived ${s.name}`) },
  ...((venue.value?.spaces.length ?? 0) > 1 ? [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => removeSpace(s) }] : []),
]]

// Access features, for the whole venue or one space
const WHOLE = 'venue'
const scope = ref(WHOLE)
const scopes = computed(() => [{ value: WHOLE, label: 'The whole venue' }, ...(venue.value?.spaces ?? []).map(s => ({ value: s.id, label: s.name }))])
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
}), 'Access features saved')
</script>

<template>
  <PageFrame
    :title="venue?.name ?? 'Venue'"
    :trail="[{ label: 'Venues', to: '/admin/modules/core/venues' }]"
    width="reading"
  >
    <template #status>
      <StatusBadge
        v-if="venue?.archived"
        tone="neutral"
        label="Archived"
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

        <PageSection title="Details">
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
              label="Name"
              required
            >
              <UInput
                v-model="details.name"
                maxlength="120"
              />
            </UFormField>
            <UFormField
              name="addressLines"
              label="Address"
              hint="Optional"
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
                label="Town or city"
              >
                <UInput
                  v-model="details.locality"
                  maxlength="120"
                />
              </UFormField>
              <UFormField
                name="postcode"
                label="Postcode"
              >
                <UInput
                  v-model="details.postcode"
                  maxlength="20"
                />
              </UFormField>
              <UFormField
                name="country"
                label="Country"
                help="Two letters, such as GB."
              >
                <UInput
                  :model-value="details.country ?? ''"
                  maxlength="2"
                  @update:model-value="details.country = String($event).trim().toUpperCase() || null"
                />
              </UFormField>
            </div>
            <UFormField
              name="description"
              label="About the venue"
              help="Shown on the venue's public page."
            >
              <UTextarea
                v-model="details.description"
                :rows="4"
                maxlength="4000"
              />
            </UFormField>
            <UFormField
              name="gettingHere"
              label="Getting here"
              help="Public transport, parking and where the entrance is."
            >
              <UTextarea
                v-model="details.gettingHere"
                :rows="3"
                maxlength="4000"
              />
            </UFormField>
            <UFormField
              name="accessInfo"
              label="Access"
              help="What to expect on arrival, in words. The features below are shown as well."
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
              label="Restore venue"
              color="neutral"
              variant="outline"
              icon="i-lucide-archive-restore"
              @click="setArchived(false)"
            />
            <UButton
              v-else
              label="Archive venue"
              color="neutral"
              variant="outline"
              icon="i-lucide-archive"
              @click="setArchived(true)"
            />
            <UButton
              type="submit"
              form="venue-details"
              label="Save venue"
            />
          </template>
        </PageSection>

        <PageSection title="Spaces">
          <template #actions>
            <UButton
              label="Add space"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              size="sm"
              @click="openSpace()"
            />
          </template>
          <RecordList label="Spaces">
            <RecordListItem
              v-for="s in venue.spaces"
              :key="s.id"
              :name="s.name"
              :description="`${kindLabel(s.kindTermId)} · ${s.defaultCapacity ? `${s.defaultCapacity} seats` : 'No capacity set'}`"
              :muted="s.archived"
            >
              <StatusBadge
                v-if="!s.managed"
                tone="neutral"
                label="Not run by the theatre"
              />
              <StatusBadge
                v-if="s.archived"
                tone="neutral"
                label="Archived"
              />
              <RowActions
                :items="spaceActions(s)"
                :label="`Actions for ${s.name}`"
              />
            </RecordListItem>
          </RecordList>
        </PageSection>

        <PageSection title="Access features">
          <UForm
            id="venue-access"
            :state="chosen"
            class="space-y-3"
            novalidate
            @submit="saveAccess"
          >
            <UFormField
              v-if="venue.spaces.length > 1"
              label="Features of"
            >
              <USelect
                v-model="scope"
                :items="scopes"
              />
            </UFormField>
            <div
              v-for="f in shownFeatures"
              :key="f.id"
              class="flex flex-wrap items-center gap-3"
            >
              <UCheckbox
                v-model="chosen[f.id]!.on"
                :label="f.label"
                class="w-56"
              />
              <UInput
                v-if="chosen[f.id]!.on"
                v-model="chosen[f.id]!.note"
                placeholder="Note, such as where it is"
                :aria-label="`Note on ${f.label}`"
                maxlength="200"
                size="sm"
                class="flex-1"
              />
            </div>
          </UForm>
          <template #footer>
            <UButton
              type="submit"
              form="venue-access"
              label="Save access features"
              color="neutral"
              variant="outline"
            />
          </template>
        </PageSection>
      </template>
    </DataBoundary>

    <UModal
      v-model:open="spaceOpen"
      :title="spaceId ? 'Edit space' : 'Add space'"
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
            label="Name"
            required
          >
            <UInput
              v-model="space.name"
              maxlength="120"
            />
          </UFormField>
          <UFormField
            name="kindTermId"
            label="Kind"
            required
          >
            <USelect
              v-model="space.kindTermId"
              :items="liveKinds"
            />
          </UFormField>
          <UFormField
            name="defaultCapacity"
            label="Usual capacity"
            hint="Optional"
            help="Box office and room bookings start from this; a seating plan can set its own."
          >
            <UInputNumber
              v-model="space.defaultCapacity"
              :min="1"
            />
          </UFormField>
          <UCheckbox
            v-model="space.performable"
            name="performable"
            label="Performances can happen here"
          />
          <div
            v-if="space.performable"
            class="grid gap-4 sm:grid-cols-2"
          >
            <UFormField
              name="doorsBeforeMinutes"
              label="Doors open before"
            >
              <MinutesInput
                v-model="space.doorsBeforeMinutes"
                :placeholder="data?.doorsBeforeMinutes"
                :max="180"
                label="Doors open before"
              />
            </UFormField>
            <UFormField
              name="runPresetId"
              label="Usual run preset"
              help="What Add a run starts from here."
            >
              <USelect
                :model-value="space.runPresetId ?? USUAL"
                :items="presetItems"
                @update:model-value="space.runPresetId = $event === USUAL ? null : String($event)"
              />
            </UFormField>
          </div>
          <UCheckbox
            v-model="space.exclusive"
            name="exclusive"
            label="One thing at a time"
            description="Turn off for a space several groups can share at once, such as a foyer."
          />
          <UFormField
            name="managed"
            label="The theatre runs this space"
            help="Turn off for a space in a building someone else runs, or one the theatre visits."
          >
            <USwitch v-model="space.managed" />
          </UFormField>
          <UFormField
            name="findingIt"
            label="Finding it"
            hint="Optional"
            help="A short note shown under the venue's directions, such as which entrance and floor."
          >
            <UInput
              v-model="space.findingIt"
              maxlength="200"
            />
          </UFormField>
          <UFormField
            name="accessInfo"
            label="Access"
            hint="Optional"
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
          :label="spaceId ? 'Save space' : 'Add space'"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
