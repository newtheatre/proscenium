<!-- One verification list (MEM-20, MEM-57; V18, V19): load a file into it, add or remove one entry,
     check one reference, and change its details. Nothing here shows the list itself. -->
<script setup lang="ts">
interface Shape { kind: 'digits' | 'letters-and-digits', min: number, max: number }
interface List { id: string, name: string, keyKind: 'email' | 'reference', entryCount: number, validUntil: string | null, referenceLabel: string | null, referenceShape: Shape | null, uploadedAt: number }
interface Detail { list: List, schemes: { id: string, name: string }[] }
interface Loaded { loaded: number, wouldLoad?: number, refused: { line: number, reason: string }[] }
interface Checked { found: boolean, current?: boolean, endsOn?: string | null, name?: string | null, claimed?: boolean }

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

// Loading a file: read in the browser, tried first, then loaded once the officer has seen the outcome.
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
  await refresh()
}

// One entry by hand.
const entry = reactive({ value: '', endsOn: '', name: '' })
const entryRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function addEntry() {
  entryRefusal.value = null
  try {
    await $api(`${base.value}/entries` as string, { method: 'POST', body: { value: entry.value, endsOn: entry.endsOn || null, name: entry.name.trim() || null } })
    toast.add({ title: t('membership.screens.list.entry-added'), color: 'success' })
    Object.assign(entry, { value: '', endsOn: '', name: '' })
    await refresh()
  }
  catch (e) {
    entryRefusal.value = toRefusal(e)
  }
}
const removing = ref('')
const removeRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function removeEntry() {
  removeRefusal.value = null
  try {
    await $api(`${base.value}/entries/remove` as string, { method: 'POST', body: { value: removing.value } })
    toast.add({ title: t('membership.screens.list.entry-removed'), color: 'success' })
    removing.value = ''
    await refresh()
  }
  catch (e) {
    removeRefusal.value = toRefusal(e)
  }
}

// Checking one value: whether it is on the list, until when, and whose it is.
const checking = ref('')
const checked = ref<Checked | null>(null)
async function check() {
  checked.value = await $api<Checked>(`${base.value}/check` as string, { method: 'POST', body: { value: checking.value } })
}
watch(checking, () => {
  checked.value = null
})

// Details.
const details = reactive({ name: '', validUntil: '', referenceLabel: '', shapeKind: 'digits' as Shape['kind'], min: 8, max: 8 })
watch(list, (l) => {
  if (l) Object.assign(details, { name: l.name, validUntil: l.validUntil ?? '', referenceLabel: l.referenceLabel ?? '', shapeKind: l.referenceShape?.kind ?? 'digits', min: l.referenceShape?.min ?? 8, max: l.referenceShape?.max ?? 8 })
}, { immediate: true })
const detailsRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function saveDetails() {
  detailsRefusal.value = null
  const reference = list.value?.keyKind === 'reference'
  try {
    await $api(base.value as string, {
      method: 'PATCH',
      body: { name: details.name, validUntil: details.validUntil || null, ...(reference ? { referenceLabel: details.referenceLabel, referenceShape: { kind: details.shapeKind, min: details.min, max: Math.max(details.min, details.max) } } : {}) },
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
const actions = computed(() => [{ label: t('membership.screens.list.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: remove }])
</script>

<template>
  <PageFrame
    :title="list?.name ?? t('membership.navigation.lists.label')"
    :description="list ? `${t(`membership.screens.lists.kinds.${list.keyKind}`)} · ${t('membership.screens.lists.entries', { count: list.entryCount })}` : undefined"
  >
    <template
      v-if="list"
      #primary
    >
      <RowActions
        :items="actions"
        :label="t('membership.screens.list.actions', { list: list.name })"
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
          v-if="list.validUntil"
          color="neutral"
          variant="subtle"
          icon="i-lucide-calendar-x"
          :title="t('membership.screens.lists.valid-until', { date: day(list.validUntil) })"
        />

        <PageSection
          :title="t('membership.screens.list.load')"
          :description="t(`membership.screens.list.load-help-${list.keyKind}`)"
        >
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
          <template #footer>
            <UButton
              icon="i-lucide-upload"
              loading-auto
              :disabled="!preview?.wouldLoad"
              :label="t('membership.screens.list.load-button')"
              @click="load"
            />
          </template>
        </PageSection>

        <PageSection
          :title="t('membership.screens.list.check')"
          :description="t('membership.screens.list.check-help')"
        >
          <UForm
            :state="{ checking }"
            class="flex flex-wrap items-end gap-3"
            novalidate
            @submit="check"
          >
            <UFormField :label="valueLabel">
              <UInput
                v-model="checking"
                maxlength="254"
                autocomplete="off"
              />
            </UFormField>
            <UButton
              type="submit"
              color="neutral"
              variant="outline"
              icon="i-lucide-search"
              loading-auto
              :disabled="!checking.trim()"
              :label="t('membership.screens.list.check-button')"
            />
          </UForm>
          <UAlert
            v-if="checked"
            class="mt-4"
            :color="checked.found && checked.current ? 'success' : 'neutral'"
            variant="subtle"
            :title="!checked.found ? t('membership.screens.list.not-on') : checked.current ? t('membership.screens.list.on') : t('membership.screens.list.on-ended')"
            :description="checked.found ? [checked.name ? t('membership.screens.list.name-is', { name: checked.name }) : t('membership.screens.list.no-name'), checked.endsOn ? t('membership.screens.list.ends', { date: day(checked.endsOn) }) : '', checked.claimed ? t('membership.screens.list.claimed') : ''].filter(Boolean).join(' ') : undefined"
          />
        </PageSection>

        <PageSection
          :title="t('membership.screens.list.by-hand')"
          :description="t('membership.screens.list.by-hand-help')"
        >
          <div class="space-y-6">
            <UForm
              :state="entry"
              class="space-y-4"
              novalidate
              @submit="addEntry"
            >
              <RefusalNotice :refusal="entryRefusal" />
              <div class="grid gap-4 sm:grid-cols-3">
                <UFormField
                  :label="valueLabel"
                  required
                >
                  <UInput
                    v-model="entry.value"
                    maxlength="254"
                    autocomplete="off"
                  />
                </UFormField>
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
              <UButton
                type="submit"
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                loading-auto
                :disabled="!entry.value.trim()"
                :label="t('membership.screens.list.add-entry')"
              />
            </UForm>
            <UForm
              :state="{ removing }"
              class="flex flex-wrap items-end gap-3"
              novalidate
              @submit="removeEntry"
            >
              <UFormField
                :label="t('membership.screens.list.remove-value', { value: valueLabel })"
                :error="removeRefusal?.reason"
              >
                <UInput
                  v-model="removing"
                  maxlength="254"
                  autocomplete="off"
                />
              </UFormField>
              <UButton
                type="submit"
                icon="i-lucide-minus"
                color="neutral"
                variant="outline"
                loading-auto
                :disabled="!removing.trim()"
                :label="t('membership.screens.list.remove-entry')"
              />
            </UForm>
          </div>
        </PageSection>

        <PageSection :title="t('membership.screens.list.details')">
          <UForm
            id="membership-list-details"
            :state="details"
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
              v-model:kind="details.shapeKind"
              v-model:min="details.min"
              v-model:max="details.max"
              :label-error="detailsRefusal?.fields?.referenceLabel ? detailsRefusal.reason : undefined"
            />
            <p
              v-if="data.schemes.length"
              class="text-sm text-muted"
            >
              {{ t('membership.screens.list.used-by', { schemes: data.schemes.map(s => s.name).join(', ') }) }}
            </p>
          </UForm>
          <template #footer>
            <UButton
              type="submit"
              form="membership-list-details"
              loading-auto
              :label="t('membership.screens.list.save')"
            />
          </template>
        </PageSection>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
