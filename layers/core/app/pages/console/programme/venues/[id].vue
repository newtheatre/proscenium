<script setup lang="ts">
// One venue (C-16, C-17): its address and public text, its spaces with kind and capacity, and the
// access features of the building and of each space. Archiving keeps the venue on the records that
// use it and takes it out of pickers and the public site.
definePageMeta({ layout: 'console' })

interface Option { id: string, label: string, icon: string | null, retired: boolean }
interface Space { id: string, name: string, kindTermId: string, defaultCapacity: number | null, performable: boolean, exclusive: boolean, description: string | null, accessInfo: string | null, archived: boolean }
interface Place { id: string, name: string, managed: boolean, addressLines: string | null, locality: string | null, postcode: string | null, country: string | null }
interface Venue extends Place { description: string | null, accessInfo: string | null, gettingHere: string | null, archived: boolean, spaces: Space[], access: { spaceId: string | null, termId: string, note: string | null }[] }

const route = useRoute()
const base = computed(() => `/api/core/venues/${String(route.params.id)}`)
const { data, status, error, refresh } = await useFetch<{ venue: Venue, kinds: Option[], features: Option[] }>(base, { key: `core:venue:${String(route.params.id)}` })
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const venue = computed(() => data.value?.venue)
const liveKinds = computed(() => (data.value?.kinds ?? []).filter(k => !k.retired).map(k => ({ value: k.id, label: k.label })))
const kindLabel = (id: string) => data.value?.kinds.find(k => k.id === id)?.label ?? ''

// One call to the venue's routes. The path is built at run time, so it is typed as a string.
function api(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body: object = {}): Promise<unknown> {
  return $fetch<unknown>(`${base.value}${path}` as string, { method, body })
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
const details = reactive({ name: '', managed: true, addressLines: '', locality: '', postcode: '', country: '', description: '', gettingHere: '', accessInfo: '' })
watch(venue, (v) => {
  if (!v) return
  Object.assign(details, {
    name: v.name, managed: v.managed, addressLines: v.addressLines ?? '', locality: v.locality ?? '', postcode: v.postcode ?? '',
    country: v.country ?? '', description: v.description ?? '', gettingHere: v.gettingHere ?? '', accessInfo: v.accessInfo ?? '',
  })
}, { immediate: true })
const saveDetails = () => run(() => api('', 'PATCH', { ...details, country: details.country.trim().toUpperCase() || null }), 'Venue saved')

async function setArchived(archived: boolean) {
  if (archived && !await confirm({ verb: 'Archive', thing: venue.value!.name, consequence: 'It leaves every picker and the public site. Records that use it keep it, and you can restore it later.', button: 'Archive venue' })) return
  await run(() => api(archived ? '/archive' : '/restore', 'POST'), archived ? 'Venue archived' : 'Venue restored')
}

// Spaces
const spaceOpen = ref(false)
const spaceId = ref<string | null>(null)
const space = reactive({ name: '', kindTermId: '', defaultCapacity: null as number | null, performable: true, exclusive: true, description: '', accessInfo: '' })
function openSpace(s?: Space) {
  spaceId.value = s?.id ?? null
  Object.assign(space, s
    ? { name: s.name, kindTermId: s.kindTermId, defaultCapacity: s.defaultCapacity, performable: s.performable, exclusive: s.exclusive, description: s.description ?? '', accessInfo: s.accessInfo ?? '' }
    : { name: '', kindTermId: liveKinds.value[0]?.value ?? '', defaultCapacity: null, performable: true, exclusive: true, description: '', accessInfo: '' })
  refusal.value = null
  spaceOpen.value = true
}
async function saveSpace() {
  const body = { ...space, defaultCapacity: space.defaultCapacity || null }
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
      <div
        v-if="venue"
        class="space-y-10"
      >
        <RefusalNotice
          v-if="!spaceOpen"
          :refusal="refusal"
        />

        <section
          class="space-y-4"
          aria-labelledby="venue-details"
        >
          <h2
            id="venue-details"
            class="text-base font-semibold"
          >
            Details
          </h2>
          <form
            class="space-y-4"
            @submit.prevent="saveDetails"
          >
            <UFormField
              label="Name"
              required
            >
              <UInput
                v-model="details.name"
                maxlength="120"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="The theatre runs this venue"
              help="Turn off for a venue the theatre visits or tours to."
            >
              <USwitch v-model="details.managed" />
            </UFormField>
            <UFormField
              label="Address"
              hint="Optional"
            >
              <UTextarea
                v-model="details.addressLines"
                :rows="2"
                maxlength="300"
                class="w-full"
              />
            </UFormField>
            <div class="grid gap-4 sm:grid-cols-3">
              <UFormField label="Town or city">
                <UInput
                  v-model="details.locality"
                  maxlength="120"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Postcode">
                <UInput
                  v-model="details.postcode"
                  maxlength="20"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Country"
                help="Two letters, such as GB."
              >
                <UInput
                  v-model="details.country"
                  maxlength="2"
                  class="w-full"
                />
              </UFormField>
            </div>
            <UFormField
              label="About the venue"
              help="Shown on the venue's public page."
            >
              <UTextarea
                v-model="details.description"
                :rows="4"
                maxlength="4000"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Getting here"
              help="Public transport, parking and where the entrance is."
            >
              <UTextarea
                v-model="details.gettingHere"
                :rows="3"
                maxlength="4000"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Access"
              help="What to expect on arrival, in words. The features below are shown as well."
            >
              <UTextarea
                v-model="details.accessInfo"
                :rows="3"
                maxlength="4000"
                class="w-full"
              />
            </UFormField>
            <div class="flex flex-wrap gap-2">
              <UButton
                type="submit"
                label="Save venue"
                :disabled="!details.name.trim()"
              />
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
            </div>
          </form>
        </section>

        <section
          class="space-y-4"
          aria-labelledby="venue-spaces"
        >
          <div class="flex items-center justify-between gap-2">
            <h2
              id="venue-spaces"
              class="text-base font-semibold"
            >
              Spaces
            </h2>
            <UButton
              label="Add space"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              size="sm"
              @click="openSpace()"
            />
          </div>
          <ul
            class="divide-y divide-default rounded-lg border border-default"
            aria-label="Spaces"
          >
            <li
              v-for="s in venue.spaces"
              :key="s.id"
              class="flex items-center gap-3 px-3 py-2"
              :class="{ 'text-muted': s.archived }"
            >
              <span class="flex-1">
                {{ s.name }}
                <span class="text-sm text-muted">· {{ kindLabel(s.kindTermId) }}</span>
              </span>
              <span class="text-sm text-muted">{{ s.defaultCapacity ? `${s.defaultCapacity} seats` : 'No capacity set' }}</span>
              <StatusBadge
                v-if="s.archived"
                tone="neutral"
                label="Archived"
              />
              <UDropdownMenu :items="spaceActions(s)">
                <UButton
                  icon="i-lucide-ellipsis"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :aria-label="`Actions for ${s.name}`"
                />
              </UDropdownMenu>
            </li>
          </ul>
        </section>

        <section
          class="space-y-4"
          aria-labelledby="venue-access"
        >
          <h2
            id="venue-access"
            class="text-base font-semibold"
          >
            Access features
          </h2>
          <UFormField
            v-if="venue.spaces.length > 1"
            label="Features of"
          >
            <USelect
              v-model="scope"
              :items="scopes"
              class="w-64"
            />
          </UFormField>
          <form
            class="space-y-3"
            @submit.prevent="saveAccess"
          >
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
            <UButton
              type="submit"
              label="Save access features"
              color="neutral"
              variant="outline"
            />
          </form>
        </section>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="spaceOpen"
      :title="spaceId ? 'Edit space' : 'Add space'"
    >
      <template #body>
        <form
          id="space-form"
          class="space-y-4"
          @submit.prevent="saveSpace"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            label="Name"
            required
          >
            <UInput
              v-model="space.name"
              maxlength="120"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Kind"
            required
          >
            <USelect
              v-model="space.kindTermId"
              :items="liveKinds"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Usual capacity"
            hint="Optional"
            help="Box office and room bookings start from this; a seating plan can set its own."
          >
            <UInputNumber
              v-model="space.defaultCapacity"
              :min="1"
              class="w-40"
            />
          </UFormField>
          <UCheckbox
            v-model="space.performable"
            label="Performances can happen here"
          />
          <UCheckbox
            v-model="space.exclusive"
            label="One thing at a time"
            description="Turn off for a space several groups can share at once, such as a foyer."
          />
          <UFormField
            label="Access"
            hint="Optional"
          >
            <UTextarea
              v-model="space.accessInfo"
              :rows="2"
              maxlength="4000"
              class="w-full"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="space-form"
          :label="spaceId ? 'Save space' : 'Add space'"
          :disabled="!space.name.trim() || !space.kindTermId"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
