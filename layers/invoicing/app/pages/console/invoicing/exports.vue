<!-- Exports (S8; IE-03 to IE-05): the ledger as another set of books wants it. A profile and a range of
     days above what the file would hold (lines, unmapped lines, Closed or Open), then Export, then
     the past exports with whether the code map has changed since each. -->
<script setup lang="ts">
interface ProfileItem { id: string, name: string, format: string, archived: boolean, opening: { from: string, to: string } }
interface Coverage { from: string, to: string, lines: number, unmappedLines: number, unmappedAccounts: { id: string, code: string, name: string, lines: number }[], closed: boolean, tooMany: boolean, ceiling: number }
interface Run { id: string, from: string, to: string, rows: number, unmappedRows: number, closed: boolean, sha256: string, createdAt: number, mapChanged: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const { range, dateTime, language } = useDates()
const number = (n: number) => new Intl.NumberFormat(language.value).format(n)

const { data, status, error, refresh } = await useAPI<{ profiles: ProfileItem[], defaultProfileId: string | null, canManage: boolean, canSetDefault: boolean }>('/api/invoicing/exports/profiles', { key: 'invoicing:export-profiles' })
const active = computed(() => (data.value?.profiles ?? []).filter(p => !p.archived))

const form = reactive({ profileId: '', from: '', to: '' })
function openOn(id: string | null | undefined) {
  const p = active.value.find(x => x.id === id) ?? active.value[0]
  if (!p) return
  Object.assign(form, { profileId: p.id, from: p.opening.from, to: p.opening.to })
}
watch(() => data.value?.defaultProfileId, id => openOn(id), { immediate: true })
function chooseProfile(id: string) {
  openOn(id)
}

const ready = computed(() => !!(form.profileId && form.from && form.to && form.to >= form.from))
const coverageQuery = computed(() => ({ profileId: form.profileId, from: form.from, to: form.to }))
const coverage = ref<Coverage | null>(null)
const coverageRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(coverageQuery, async (q) => {
  coverage.value = null
  coverageRefusal.value = null
  if (!ready.value) return
  try {
    const found = await $api<Coverage>('/api/invoicing/exports/coverage', { query: q })
    if (JSON.stringify(coverageQuery.value) === JSON.stringify(q)) coverage.value = found
  }
  catch (e) {
    coverageRefusal.value = toRefusal(e)
  }
}, { immediate: true })

const runs = ref<Run[]>([])
async function loadRuns() {
  runs.value = form.profileId ? (await $api<{ runs: Run[] }>('/api/invoicing/exports/runs', { query: { profileId: form.profileId } })).runs : []
}
watch(() => form.profileId, loadRuns, { immediate: true })

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function download() {
  refusal.value = null
  try {
    // The plain fetch's raw call, for the response's headers: the route types are too deep to check here.
    const raw = $api.raw as unknown as (url: string, options: object) => Promise<{ _data?: string, headers: Headers }>
    const response = await raw('/api/invoicing/exports/file', { query: { ...form }, responseType: 'text' })
    const closed = coverage.value?.closed ?? false
    const url = URL.createObjectURL(new Blob([response._data ?? ''], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${active.value.find(p => p.id === form.profileId)?.name ?? 'export'} ${form.from} to ${form.to}${closed ? '' : ' (open)'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    const sameAs = response.headers.get('x-export-same-as')
    toast.add({
      title: t('invoicing.screens.exports.taken'),
      description: sameAs ? t('invoicing.screens.exports.same-as', { when: dateTime(Number(sameAs)) }) : undefined,
      color: 'success',
    })
    await loadRuns()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

async function check(run: Run) {
  try {
    const result = await $api<{ same: boolean, mapChanged: boolean }>(`/api/invoicing/exports/runs/${run.id}/check`)
    toast.add(result.same
      ? { title: t('invoicing.screens.exports.check-same'), color: 'success' }
      : { title: t('invoicing.screens.exports.check-differs'), description: t(result.mapChanged ? 'invoicing.screens.exports.map-changed' : 'invoicing.screens.exports.ledger-changed'), color: 'warning' })
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}
</script>

<template>
  <PageFrame
    :title="t('invoicing.navigation.exports.label')"
    :description="t('invoicing.screens.exports.help')"
  >
    <template
      v-if="data?.canManage"
      #primary
    >
      <UButton
        :label="t('invoicing.screens.exports.profiles')"
        icon="i-lucide-file-cog"
        color="neutral"
        variant="outline"
        to="/admin/modules/invoicing/exports"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!active.length"
        :title="t('invoicing.screens.exports.no-profiles')"
        :description="t('invoicing.screens.exports.no-profiles-help')"
        icon="i-lucide-file-spreadsheet"
        :action="data?.canManage ? { label: t('invoicing.screens.exports.profiles'), to: '/admin/modules/invoicing/exports' } : undefined"
      />
      <div
        v-else
        class="space-y-8"
      >
        <UForm
          class="space-y-4"
          :state="form"
          :validate="() => needs({ profileId: form.profileId, from: form.from, to: form.to })"
          novalidate
          @submit="download"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="profileId"
            :label="t('invoicing.screens.exports.profile')"
            required
          >
            <USelect
              :model-value="form.profileId"
              :items="active.map(p => ({ value: p.id, label: p.name }))"
              class="sm:w-80"
              @update:model-value="chooseProfile(String($event))"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              name="from"
              :label="t('invoicing.screens.exports.from')"
              required
            >
              <FieldDate
                v-model="form.from"
                :max="form.to || undefined"
              />
            </UFormField>
            <UFormField
              name="to"
              :label="t('invoicing.screens.exports.to')"
              required
            >
              <FieldDate
                v-model="form.to"
                :min="form.from || undefined"
              />
            </UFormField>
          </div>

          <RefusalNotice :refusal="coverageRefusal" />
          <div
            v-if="coverage"
            class="space-y-3"
            aria-live="polite"
          >
            <p class="flex flex-wrap items-center gap-2 text-sm">
              <span>{{ range(coverage.from, coverage.to) }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ t('invoicing.screens.exports.lines', { count: coverage.lines, n: number(coverage.lines) }) }}</span>
              <StatusBadge
                :tone="coverage.closed ? 'success' : 'warning'"
                :label="t(coverage.closed ? 'invoicing.screens.exports.closed' : 'invoicing.screens.exports.open')"
              />
            </p>
            <p
              v-if="!coverage.closed"
              class="text-sm text-muted"
            >
              {{ t('invoicing.screens.exports.open-help') }}
            </p>
            <UAlert
              v-if="coverage.tooMany"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
              :title="t('invoicing.screens.exports.too-many', { n: number(coverage.lines), max: number(coverage.ceiling) })"
            />
            <UAlert
              v-if="coverage.unmappedLines"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              :title="t('invoicing.screens.exports.unmapped', { count: coverage.unmappedLines, n: number(coverage.unmappedLines) })"
            >
              <template #description>
                <ul class="mt-1 list-disc ps-5">
                  <li
                    v-for="a in coverage.unmappedAccounts"
                    :key="a.id"
                  >
                    {{ a.name }} <span class="font-mono">({{ a.code }})</span>: {{ number(a.lines) }}
                  </li>
                </ul>
                <ULink
                  v-if="data?.canManage"
                  :to="`/admin/modules/invoicing/exports/${form.profileId}`"
                  class="mt-2 inline-block underline"
                >
                  {{ t('invoicing.screens.exports.give-codes') }}
                </ULink>
              </template>
            </UAlert>
          </div>

          <UButton
            type="submit"
            icon="i-lucide-file-down"
            loading-auto
            :disabled="!ready || coverage?.tooMany"
            :label="t('invoicing.screens.exports.button')"
          />
        </UForm>

        <PageSection :title="t('invoicing.screens.exports.past')">
          <p
            v-if="!runs.length"
            class="text-sm text-muted"
          >
            {{ t('invoicing.screens.exports.no-runs') }}
          </p>
          <RecordList
            v-else
            :label="t('invoicing.screens.exports.past')"
          >
            <RecordListItem
              v-for="run in runs"
              :key="run.id"
              :name="range(run.from, run.to)"
              :description="t('invoicing.screens.exports.run-line', { when: dateTime(run.createdAt), n: number(run.rows), count: run.rows })"
            >
              <StatusBadge
                :tone="run.closed ? 'success' : 'warning'"
                :label="t(run.closed ? 'invoicing.screens.exports.closed' : 'invoicing.screens.exports.open')"
              />
              <StatusBadge
                v-if="run.mapChanged"
                tone="warning"
                :label="t('invoicing.screens.exports.would-differ')"
              />
              <RowActions
                :label="t('invoicing.screens.exports.run-actions', { range: range(run.from, run.to) })"
                :items="[{ label: t('invoicing.screens.exports.check'), icon: 'i-lucide-fingerprint', onSelect: () => check(run) }]"
              />
            </RecordListItem>
          </RecordList>
        </PageSection>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
