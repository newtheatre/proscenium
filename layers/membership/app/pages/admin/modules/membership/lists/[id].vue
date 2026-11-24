<!-- One verification list (MEM-20, MEM-57; V18, V19). A strip of facts says what it holds; Load file
     and Add entry sit at the top and open a window each, with Remove an entry and Delete in the
     menu; the page itself checks one entry and keeps the list's details. Nothing here shows the
     list itself. -->
<script setup lang="ts">
import { z } from 'zod'

interface Shape { kind: 'digits' | 'letters-and-digits', min: number, max: number }
interface List { id: string, name: string, keyKind: 'email' | 'reference', entryCount: number, validUntil: string | null, referenceLabel: string | null, referenceNoun: string | null, referenceShape: Shape | null, uploadedAt: number, loaded: boolean }
interface Detail { list: List, schemes: { id: string, name: string }[], keySet: boolean, byHand: number }
interface Loaded { loaded: number, wouldLoad?: number, refused: { line: number, reason: string }[] }
interface Checked { found: boolean, malformed?: boolean, shape?: Shape | null, current?: boolean, endsOn?: string | null, name?: string | null, claimed?: boolean }

const route = useRoute()
const id = computed(() => String(route.params.id))
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day } = useDates()
const toast = useToast()
const { confirm } = useConfirm()
const { data, status, error, refresh } = await useAPI<Detail>(() => `/api/membership/lists/${id.value}`, { key: `membership:list:${id.value}` })
const list = computed(() => data.value?.list)
const base = computed(() => `/api/membership/lists/${id.value}`)
const valueLabel = computed(() => t(`membership.screens.list.value-${list.value?.keyKind ?? 'reference'}`))

// Loading a file, in a window: read in the browser, tried first, then loaded once the officer has
// seen the outcome.
const loading = ref(false)
const file = ref<File | null>(null)
const preview = ref<Loaded | null>(null)
const loadRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function send(dryRun: boolean): Promise<Loaded | null> {
  loadRefusal.value = null
  try {
    return await $api<Loaded>(`${base.value}/import` as string, { method: 'POST', body: { file: await file.value!.text(), dryRun } })
  }
  catch (e) {
    loadRefusal.value = toRefusal(e)
    return null
  }
}
watch(file, async (f) => {
  preview.value = f ? await send(true) : null
})
async function load() {
  const done = await send(false)
  if (!done) return
  toast.add({ title: t('membership.screens.list.loaded', { count: done.loaded }), color: 'success' })
  file.value = null
  loading.value = false
  await refresh()
}

// One entry by hand, added or removed in a window.
const adding = ref(false)
const entry = reactive({ value: '', endsOn: '', name: '' })
const entrySchema = z.object({ value: z.string().trim().min(1).max(254) }) // not-policy: the route's bounds
function openAdd() {
  Object.assign(entry, { value: '', endsOn: '', name: '' })
  entryRefusal.value = null
  adding.value = true
}
const entryRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function addEntry() {
  entryRefusal.value = null
  try {
    await $api(`${base.value}/entries` as string, { method: 'POST', body: { value: entry.value, endsOn: entry.endsOn || null, name: entry.name.trim() || null } })
    toast.add({ title: t('membership.screens.list.entry-added'), color: 'success' })
    adding.value = false
    await refresh()
  }
  catch (e) {
    entryRefusal.value = toRefusal(e)
  }
}
const removingOpen = ref(false)
const removing = ref('')
const removeSchema = z.object({ removing: z.string().trim().min(1).max(254) }) // not-policy: the route's bounds
function openRemove() {
  removing.value = ''
  removeRefusal.value = null
  removingOpen.value = true
}
const removeRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function removeEntry() {
  removeRefusal.value = null
  try {
    await $api(`${base.value}/entries/remove` as string, { method: 'POST', body: { value: removing.value } })
    toast.add({ title: t('membership.screens.list.entry-removed'), color: 'success' })
    removingOpen.value = false
    await refresh()
  }
  catch (e) {
    removeRefusal.value = toRefusal(e)
  }
}

// Checking one value: whether it is on the list, until when, and whose it is.
const checking = ref('')
const checked = ref<Checked | null>(null)
const checkSchema = z.object({ checking: z.string().trim().min(1).max(254) }) // not-policy: the route's bounds
async function check() {
  checked.value = await $api<Checked>(`${base.value}/check` as string, { method: 'POST', body: { value: checking.value } })
}
const checkedDescription = computed(() => {
  const c = checked.value
  if (!c) return undefined
  if (c.malformed) return c.shape ? t(`membership.screens.list.malformed-${c.shape.kind}`, { min: c.shape.min, max: c.shape.max }) : undefined
  if (!c.found) return undefined
  return [
    c.name ? t('membership.screens.list.name-is', { name: c.name }) : t('membership.screens.list.no-name'),
    c.endsOn ? t(c.current ? 'membership.screens.list.ends' : 'membership.screens.list.ended', { date: day(c.endsOn) }) : '',
    c.claimed ? t('membership.screens.list.claimed') : '',
  ].filter(Boolean).join(' ')
})
watch(checking, () => {
  checked.value = null
})

// Details.
const details = reactive({ name: '', validUntil: '', referenceLabel: '', referenceNoun: '', shapeKind: 'digits' as Shape['kind'], min: 8, max: 8 })
watch(list, (l) => {
  if (l) Object.assign(details, { name: l.name, validUntil: l.validUntil ?? '', referenceLabel: l.referenceLabel ?? '', referenceNoun: l.referenceNoun ?? '', shapeKind: l.referenceShape?.kind ?? 'digits', min: l.referenceShape?.min ?? 8, max: l.referenceShape?.max ?? 8 })
}, { immediate: true })
const detailsRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function saveDetails() {
  detailsRefusal.value = null
  const reference = list.value?.keyKind === 'reference'
  try {
    await $api(base.value as string, {
      method: 'PATCH',
      body: { name: details.name, validUntil: details.validUntil || null, ...(reference ? { referenceLabel: details.referenceLabel, referenceNoun: details.referenceNoun.trim() || null, referenceShape: { kind: details.shapeKind, min: details.min, max: Math.max(details.min, details.max) } } : {}) },
    })
    toast.add({ title: t('membership.screens.list.saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    detailsRefusal.value = toRefusal(e)
  }
}
async function remove() {
  if (!(await confirm({ verb: t('membership.screens.list.verb-delete'), thing: list.value!.name, consequence: t('membership.screens.list.confirm-delete'), button: t('membership.screens.list.delete') }))) return
  try {
    await $api(base.value as string, { method: 'DELETE', body: {} })
    await navigateTo('/admin/modules/membership/lists')
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, description: toRefusal(e).remedy, color: 'error' })
  }
}
const actions = computed(() => [
  [
    { label: t('membership.screens.list.add-entry'), icon: 'i-lucide-plus', onSelect: openAdd },
    { label: t('membership.screens.list.remove-entry'), icon: 'i-lucide-user-minus', onSelect: openRemove },
  ],
  [{ label: t('membership.screens.list.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: remove }],
])
// What the list holds, at a glance.
const facts = computed(() => {
  const l = list.value
  if (!l) return []
  return [
    { label: t('membership.screens.list.fact-holds'), value: t(`membership.screens.lists.kinds.${l.keyKind}`) },
    { label: t('membership.screens.list.fact-entries'), value: String(l.entryCount) },
    // Added by staff and kept through file loads until a file holds them too.
    ...(data.value?.byHand ? [{ label: t('membership.screens.list.fact-by-hand'), value: String(data.value.byHand) }] : []),
    ...(l.validUntil ? [{ label: t('membership.screens.list.valid-until'), value: day(l.validUntil) }] : []),
    { label: t('membership.screens.list.fact-loaded'), value: l.loaded ? day(new Date(l.uploadedAt)) : t('membership.screens.list.fact-never') },
    // One scheme is a link to it; several are named.
    { label: t('membership.screens.list.fact-used-by'), value: data.value?.schemes.length ? data.value.schemes.map(s => s.name).join(', ') : t('membership.screens.list.fact-no-scheme'), to: data.value?.schemes.length === 1 ? `/admin/modules/membership/schemes/${data.value.schemes[0]!.id}` : undefined },
  ]
})
const membershipListDetailsForm = useFormRef('membershipListDetailsForm')
const membershipListEntryForm = useFormRef('membershipListEntryForm')
const membershipListRemoveForm = useFormRef('membershipListRemoveForm')
</script>

<template>
  <PageFrame
    :title="list?.name ?? t('membership.navigation.lists.label')"
    :trail="[{ label: t('membership.navigation.lists.label'), to: '/admin/modules/membership/lists' }]"
    width="reading"
  >
    <template
      v-if="list"
      #primary
    >
      <!-- Loading the file is what the page is for; adding one entry by hand sits in the menu with removing one. -->
      <UButton
        icon="i-lucide-upload"
        :label="t('membership.screens.list.load')"
        :disabled="!data?.keySet"
        @click="loading = true"
      />
      <RowActions
        :items="actions"
        :label="t('membership.screens.list.actions', { list: list.name })"
        variant="outline"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data && list"
        class="space-y-6"
      >
        <UAlert
          v-if="!data.keySet"
          color="warning"
          variant="subtle"
          icon="i-lucide-key-round"
          :title="t('membership.screens.lists.no-key')"
        >
          <template #description>
            {{ t('membership.screens.list.no-key-here') }}
            <ULink
              to="/admin/modules/membership/lists"
              class="font-medium underline"
            >
              {{ t('membership.screens.list.no-key-link') }}
            </ULink>
          </template>
        </UAlert>
        <FactStrip :facts="facts" />

        <PageSection
          :title="t('membership.screens.list.check')"
          :description="t(`membership.screens.list.check-help-${list.keyKind}`)"
        >
          <UForm
            :state="{ checking }"
            :schema="checkSchema"
            novalidate
            @submit="check"
          >
            <UFormField
              name="checking"
              :label="valueLabel"
            >
              <UFieldGroup class="w-full">
                <UInput
                  v-model="checking"
                  maxlength="254"
                  autocomplete="off"
                  class="flex-1"
                />
                <UButton
                  type="submit"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-search"
                  loading-auto
                  :label="t('membership.screens.list.check-button')"
                />
              </UFieldGroup>
            </UFormField>
          </UForm>
          <UAlert
            v-if="checked"
            :color="checked.found && checked.current ? 'success' : checked.malformed ? 'warning' : 'neutral'"
            variant="subtle"
            :icon="checked.found && checked.current ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
            :title="checked.malformed ? t('membership.screens.list.malformed') : !checked.found ? t('membership.screens.list.not-on') : checked.current ? t('membership.screens.list.on') : t('membership.screens.list.on-ended')"
            :description="checkedDescription"
          />
        </PageSection>

        <PageSection :title="t('membership.screens.list.details')">
          <UForm
            id="membership-list-details"
            ref="membershipListDetailsForm"
            :state="details"
            :validate="() => listErrors({ name: details.name, referenceLabel: list?.keyKind === 'reference' ? details.referenceLabel : undefined })"
            class="space-y-4"
            novalidate
            @submit="saveDetails"
          >
            <RefusalNotice :refusal="detailsRefusal" />
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                :label="t('membership.screens.list.name')"
                required
              >
                <UInput
                  v-model="details.name"
                  maxlength="80"
                />
              </UFormField>
              <UFormField
                :label="t('membership.screens.list.valid-until')"
                :help="t('membership.screens.list.valid-until-help')"
              >
                <FieldDate v-model="details.validUntil" />
              </UFormField>
            </div>
            <MembershipListShape
              v-if="list.keyKind === 'reference'"
              v-model:label="details.referenceLabel"
              v-model:noun="details.referenceNoun"
              v-model:kind="details.shapeKind"
              v-model:min="details.min"
              v-model:max="details.max"
              :label-error="detailsRefusal?.fields?.referenceLabel ? detailsRefusal.reason : undefined"
              :noun-error="detailsRefusal?.fields?.referenceNoun ? detailsRefusal.reason : undefined"
            />
          </UForm>
          <template #footer>
            <UButton
              type="submit"
              form="membership-list-details"
              :loading="membershipListDetailsForm?.loading"
              :label="t('membership.screens.list.save')"
            />
          </template>
        </PageSection>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="loading"
      :title="t('membership.screens.list.load')"
      :description="list ? t(`membership.screens.list.load-help-${list.keyKind}`) : undefined"
      @after:leave="file = null"
    >
      <template #body>
        <div class="space-y-4">
          <RefusalNotice :refusal="loadRefusal" />
          <UFileUpload
            v-model="file"
            accept=".csv,text/csv,text/plain"
            :label="t('membership.screens.list.file')"
            :description="t('membership.screens.list.file-help')"
            class="w-full"
          />
          <UAlert
            v-if="preview"
            :color="preview.refused.length ? 'warning' : 'success'"
            variant="subtle"
            :title="t('membership.screens.list.would-load', { count: preview.wouldLoad ?? 0 })"
          >
            <template
              v-if="preview.refused.length"
              #description
            >
              <p>{{ t('membership.screens.list.refused', { count: preview.refused.length }) }}</p>
              <ul class="list-disc ps-5">
                <li
                  v-for="r in preview.refused.slice(0, 10)"
                  :key="r.line"
                >
                  {{ t('membership.screens.list.refused-line', { line: r.line, reason: t(`membership.screens.list.reasons.${r.reason}`) }) }}
                </li>
              </ul>
            </template>
          </UAlert>
        </div>
      </template>
      <template #footer>
        <UButton
          icon="i-lucide-upload"
          loading-auto
          :disabled="!preview?.wouldLoad"
          :label="t('membership.screens.list.load-button')"
          @click="load"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="adding"
      :title="t('membership.screens.list.add-entry')"
      :description="t('membership.screens.list.add-help')"
    >
      <template #body>
        <UForm
          id="membership-list-entry"
          ref="membershipListEntryForm"
          :state="entry"
          :schema="entrySchema"
          class="space-y-4"
          novalidate
          @submit="addEntry"
        >
          <RefusalNotice :refusal="entryRefusal" />
          <UFormField
            name="value"
            :label="valueLabel"
            required
          >
            <UInput
              v-model="entry.value"
              maxlength="254"
              autocomplete="off"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="t('membership.screens.list.ends-on')"
              :help="t('membership.screens.list.ends-on-help')"
            >
              <FieldDate v-model="entry.endsOn" />
            </UFormField>
            <UFormField
              :label="t('membership.screens.list.holder-name')"
              :help="t('membership.screens.list.holder-name-help')"
            >
              <UInput
                v-model="entry.name"
                maxlength="120"
              />
            </UFormField>
          </div>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="membership-list-entry"
          :loading="membershipListEntryForm?.loading"
          :label="t('membership.screens.list.add-entry')"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="removingOpen"
      :title="t('membership.screens.list.remove-entry')"
      :description="t('membership.screens.list.remove-help')"
    >
      <template #body>
        <UForm
          id="membership-list-remove"
          ref="membershipListRemoveForm"
          :state="{ removing }"
          :schema="removeSchema"
          novalidate
          @submit="removeEntry"
        >
          <UFormField
            name="removing"
            :label="valueLabel"
            :error="removeRefusal?.reason"
            required
          >
            <UInput
              v-model="removing"
              maxlength="254"
              autocomplete="off"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="membership-list-remove"
          color="error"
          :loading="membershipListRemoveForm?.loading"
          :label="t('membership.screens.list.remove-entry')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
