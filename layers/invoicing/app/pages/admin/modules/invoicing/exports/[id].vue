<!-- Export profile (S11; IE-02, IE-06): the layout, then the code map over every ledger account, grouped
     by module, those with entries and no code first, then the other books' name for each tax code.
     A kind of posting can take its own code (E-06); each code change is audited (E-14). -->
<script setup lang="ts">
import { COLUMN_KEYS, DATE_FORMATS, GRANULARITIES, PERIOD_RULES, SIGNS, SPLIT_BY, type ColumnKey, type ExportColumn } from '../../../../../../shared/exports'

interface Code { postingKind: string | null, code: string | null, codeName: string }
interface Account { id: string, code: string, name: string, kind: string, module: string, used: boolean, money: boolean, codes: Code[] }
interface Profile {
  id: string
  name: string
  format: 'journal' | 'custom'
  granularity: string
  columns: ExportColumn[]
  dateFormat: string
  signs: string
  splitBy: string
  totalLine: string
  totalLabel: string
  taxMap: Record<string, string>
  kindLabels: Record<string, string>
  unmappedCode: string
  periodRule: string
  archivedAt: number | null
}
const POSTING_KINDS = ['sale', 'refund', 'fee', 'payout', 'recognition', 'transfer', 'cash_variance', 'unfulfilled', 'correction', 'opening'] as const

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<{ profile: Profile, accounts: Account[], taxCodes: { code: string, label: string }[] }>(() => `/api/invoicing/exports/profiles/${id.value}`, { key: `invoicing:export-profile:${id.value}` })

// The layout form, a copy of the saved profile until Save.
const form = reactive({ name: '', format: 'journal' as Profile['format'], granularity: 'entry', columns: [] as ExportColumn[], dateFormat: 'iso', signs: 'split', splitBy: 'none', totalLine: 'none', totalLabel: '', unmappedCode: 'UNMAPPED', periodRule: 'period', taxMap: {} as Record<string, string>, kindLabels: [] as { key: string, label: string }[] })
function reset() {
  const p = data.value?.profile
  if (!p) return
  Object.assign(form, {
    name: p.name, format: p.format, granularity: p.granularity, columns: p.columns.map(c => ({ ...c })), dateFormat: p.dateFormat, signs: p.signs, splitBy: p.splitBy,
    totalLine: p.totalLine, totalLabel: p.totalLabel, unmappedCode: p.unmappedCode, periodRule: p.periodRule, taxMap: { ...p.taxMap },
    kindLabels: Object.entries(p.kindLabels).map(([key, label]) => ({ key, label })),
  })
}
watch(() => data.value?.profile, reset, { immediate: true })

const choice = (group: string, values: readonly string[]) => values.map(value => ({ value, label: t(`invoicing.screens.profile.${group}.${value}`) }))
const totalItems = computed(() => [
  { value: 'none', label: t('invoicing.screens.profile.total.none') },
  { value: 'net', label: t('invoicing.screens.profile.total.net') },
  ...(data.value?.accounts ?? []).filter(a => a.money).map(a => ({ value: a.code, label: `${a.name} (${a.code})` })),
])
const columnItems = COLUMN_KEYS.map(value => ({ value, label: t(`invoicing.screens.profile.columns.${value}`) }))
function addColumn() {
  form.columns.push({ key: 'date', header: t('invoicing.screens.profile.columns.date') })
}
function moveColumn(i: number, by: number) {
  const [c] = form.columns.splice(i, 1)
  form.columns.splice(i + by, 0, c!)
}
function setColumnKey(c: ExportColumn, key: ColumnKey) {
  if (c.header === t(`invoicing.screens.profile.columns.${c.key}`)) c.header = t(`invoicing.screens.profile.columns.${key}`)
  c.key = key
}

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function save() {
  refusal.value = null
  try {
    await $api(`/api/invoicing/exports/profiles/${id.value}`, { method: 'PATCH', body: {
      name: form.name, format: form.format, granularity: form.granularity, dateFormat: form.dateFormat, signs: form.signs, splitBy: form.splitBy,
      totalLine: form.totalLine, totalLabel: form.totalLabel, unmappedCode: form.unmappedCode, periodRule: form.periodRule,
      ...(form.format === 'custom' ? { columns: form.columns } : {}),
      taxMap: Object.fromEntries(Object.entries(form.taxMap).filter(([, v]) => v.trim())),
      kindLabels: Object.fromEntries(form.kindLabels.filter(k => k.key.trim() && k.label.trim()).map(k => [k.key.trim(), k.label.trim()])),
    } })
    toast.add({ title: t('invoicing.screens.profile.saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// The code map: by module, accounts with entries and no code first.
const codeOf = (a: Account) => a.codes.find(c => c.postingKind === null)
const unmappedAccounts = computed(() => (data.value?.accounts ?? []).filter(a => a.used && !codeOf(a)?.code))
const groups = computed(() => {
  const by = new Map<string, Account[]>()
  for (const a of data.value?.accounts ?? []) by.set(a.module, [...(by.get(a.module) ?? []), a])
  for (const list of by.values()) list.sort((x, y) => Number(!!codeOf(x)?.code || !x.used) - Number(!!codeOf(y)?.code || !y.used) || x.code.localeCompare(y.code))
  return [...by].map(([module, accounts]) => ({ module, accounts }))
})
const drafts = reactive<Record<string, { code: string, codeName: string }>>({})
const draftOf = (accountId: string, kind: string | null) => {
  const key = `${accountId}|${kind ?? ''}`
  if (!drafts[key]) {
    const c = data.value?.accounts.find(a => a.id === accountId)?.codes.find(x => x.postingKind === kind)
    drafts[key] = { code: c?.code ?? '', codeName: c?.codeName ?? '' }
  }
  return drafts[key]
}
watch(() => data.value?.accounts, () => {
  for (const k of Object.keys(drafts)) Reflect.deleteProperty(drafts, k)
})
const codeError = ref<Record<string, string>>({})
async function saveCode(a: Account, kind: string | null, remove = false) {
  const key = `${a.id}|${kind ?? ''}`
  const draft = draftOf(a.id, kind)
  codeError.value = { ...codeError.value, [key]: '' }
  try {
    await $api(`/api/invoicing/exports/profiles/${id.value}/codes`, { method: 'PUT', body: { accountId: a.id, postingKind: kind, code: draft.code.trim() || null, codeName: draft.codeName.trim(), remove } })
    toast.add({ title: t(remove ? 'invoicing.screens.profile.code-removed' : 'invoicing.screens.profile.code-saved', { account: a.name }), color: 'success' })
    await refresh()
  }
  catch (e) {
    codeError.value = { ...codeError.value, [key]: toRefusal(e).reason }
  }
}
const adding = reactive<Record<string, string | undefined>>({})
const addingKind = (accountId: string) => adding[accountId] as typeof POSTING_KINDS[number] | undefined
function addKind(a: Account) {
  const kind = adding[a.id]
  if (!kind) return
  draftOf(a.id, kind)
  a.codes.push({ postingKind: kind, code: null, codeName: '' })
  adding[a.id] = undefined
}

const tabs = computed(() => [
  { label: t('invoicing.screens.profile.tabs.layout'), slot: 'layout' as const, value: 'layout' },
  { label: t('invoicing.screens.profile.tabs.codes'), slot: 'codes' as const, value: 'codes', badge: unmappedAccounts.value.length || undefined },
  { label: t('invoicing.screens.profile.tabs.tax'), slot: 'tax' as const, value: 'tax' },
])
const tab = ref(route.hash === '#codes' ? 'codes' : 'layout')

const preview = ref<{ from: string, to: string, rows: number, lines: string[] } | null>(null)
const previewOpen = ref(false)
const previewRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function showPreview() {
  previewRefusal.value = null
  preview.value = null
  previewOpen.value = true
  try {
    preview.value = await $api(`/api/invoicing/exports/profiles/${id.value}/preview`)
  }
  catch (e) {
    previewRefusal.value = toRefusal(e)
  }
}
const { range } = useDates()
</script>

<template>
  <PageFrame
    :title="data?.profile.name ?? t('invoicing.navigation.export-profiles.label')"
    :description="t('invoicing.screens.profile.help')"
    :trail="[{ label: t('invoicing.navigation.export-profiles.label'), to: '/admin/modules/invoicing/exports' }]"
    long-title
  >
    <template #primary>
      <UButton
        :label="t('invoicing.screens.profile.preview')"
        icon="i-lucide-eye"
        color="neutral"
        variant="outline"
        @click="showPreview"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <UTabs
        v-model="tab"
        :items="tabs"
        variant="link"
        :unmount-on-hide="false"
      >
        <template #layout>
          <UForm
            :state="form"
            class="space-y-6 pt-4"
            :validate="() => needs({ name: form.name, unmappedCode: form.unmappedCode })"
            novalidate
            @submit="save"
          >
            <RefusalNotice :refusal="refusal" />
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                name="name"
                :label="t('invoicing.screens.profiles.name')"
                required
                :error="refusal?.fields?.name ? refusal.reason : undefined"
              >
                <UInput
                  v-model="form.name"
                  maxlength="60"
                />
              </UFormField>
              <UFormField
                name="format"
                :label="t('invoicing.screens.profile.format')"
                :help="t(`invoicing.screens.profile.format-help.${form.format}`)"
              >
                <USelect
                  v-model="form.format"
                  :items="choice('formats', ['journal', 'custom'])"
                />
              </UFormField>
              <UFormField
                name="granularity"
                :label="t('invoicing.screens.profile.granularity-label')"
              >
                <USelect
                  v-model="form.granularity"
                  :items="choice('granularity', GRANULARITIES)"
                />
              </UFormField>
              <UFormField
                v-if="form.granularity === 'daily'"
                name="splitBy"
                :label="t('invoicing.screens.profile.split-by-label')"
              >
                <USelect
                  v-model="form.splitBy"
                  :items="choice('split-by', SPLIT_BY)"
                />
              </UFormField>
              <UFormField
                name="dateFormat"
                :label="t('invoicing.screens.profile.date-format-label')"
              >
                <USelect
                  v-model="form.dateFormat"
                  :items="choice('date-format', DATE_FORMATS)"
                />
              </UFormField>
              <UFormField
                name="signs"
                :label="t('invoicing.screens.profile.signs-label')"
              >
                <USelect
                  v-model="form.signs"
                  :items="choice('signs', SIGNS)"
                />
              </UFormField>
              <UFormField
                name="periodRule"
                :label="t('invoicing.screens.profile.period-rule-label')"
                :help="t('invoicing.screens.profile.period-rule-help')"
              >
                <USelect
                  v-model="form.periodRule"
                  :items="choice('period-rule', PERIOD_RULES)"
                />
              </UFormField>
              <UFormField
                name="unmappedCode"
                :label="t('invoicing.screens.profile.unmapped-code')"
                :help="t('invoicing.screens.profile.unmapped-code-help')"
                required
              >
                <UInput
                  v-model="form.unmappedCode"
                  maxlength="20"
                  class="font-mono"
                />
              </UFormField>
              <UFormField
                name="totalLine"
                :label="t('invoicing.screens.profile.total-line')"
                :help="t('invoicing.screens.profile.total-line-help')"
              >
                <USelect
                  v-model="form.totalLine"
                  :items="totalItems"
                />
              </UFormField>
              <UFormField
                v-if="form.totalLine !== 'none'"
                name="totalLabel"
                :label="t('invoicing.screens.profile.total-label')"
              >
                <UInput
                  v-model="form.totalLabel"
                  maxlength="80"
                />
              </UFormField>
            </div>

            <PageSection
              v-if="form.format === 'custom'"
              :title="t('invoicing.screens.profile.columns-title')"
              :description="t('invoicing.screens.profile.columns-help')"
            >
              <ol class="space-y-2">
                <li
                  v-for="(c, i) in form.columns"
                  :key="i"
                  class="flex flex-wrap items-center gap-2"
                >
                  <span class="w-6 text-sm text-muted tabular-nums">{{ i + 1 }}</span>
                  <USelect
                    :model-value="c.key"
                    :items="columnItems"
                    :aria-label="t('invoicing.screens.profile.column-field', { n: i + 1 })"
                    class="sm:w-56"
                    @update:model-value="setColumnKey(c, $event as ColumnKey)"
                  />
                  <UInput
                    v-model="c.header"
                    maxlength="40"
                    :aria-label="t('invoicing.screens.profile.column-header', { n: i + 1 })"
                    class="sm:w-56"
                  />
                  <IconButton
                    icon="i-lucide-arrow-up"
                    :label="t('invoicing.screens.profile.column-up', { n: i + 1 })"
                    size="sm"
                    :disabled="i === 0"
                    @click="moveColumn(i, -1)"
                  />
                  <IconButton
                    icon="i-lucide-arrow-down"
                    :label="t('invoicing.screens.profile.column-down', { n: i + 1 })"
                    size="sm"
                    :disabled="i === form.columns.length - 1"
                    @click="moveColumn(i, 1)"
                  />
                  <IconButton
                    icon="i-lucide-x"
                    :label="t('invoicing.screens.profile.column-remove', { n: i + 1 })"
                    size="sm"
                    @click="form.columns.splice(i, 1)"
                  />
                </li>
              </ol>
              <UButton
                :label="t('invoicing.screens.profile.column-add')"
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                size="sm"
                class="mt-2"
                @click="addColumn"
              />
            </PageSection>

            <PageSection
              v-if="form.format === 'custom' && form.columns.some(c => c.key === 'kind-label')"
              :title="t('invoicing.screens.profile.kind-labels-title')"
              :description="t('invoicing.screens.profile.kind-labels-help')"
            >
              <ul class="space-y-2">
                <li
                  v-for="(k, i) in form.kindLabels"
                  :key="i"
                  class="flex flex-wrap items-center gap-2"
                >
                  <UInput
                    v-model="k.key"
                    maxlength="80"
                    class="font-mono sm:w-64"
                    :aria-label="t('invoicing.screens.profile.kind-label-key', { n: i + 1 })"
                  />
                  <UInput
                    v-model="k.label"
                    maxlength="80"
                    class="sm:w-64"
                    :aria-label="t('invoicing.screens.profile.kind-label-text', { n: i + 1 })"
                  />
                  <IconButton
                    icon="i-lucide-x"
                    :label="t('invoicing.screens.profile.kind-label-remove', { n: i + 1 })"
                    size="sm"
                    @click="form.kindLabels.splice(i, 1)"
                  />
                </li>
              </ul>
              <UButton
                :label="t('invoicing.screens.profile.kind-label-add')"
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                size="sm"
                class="mt-2"
                @click="form.kindLabels.push({ key: '', label: '' })"
              />
            </PageSection>

            <div class="flex gap-2">
              <UButton
                type="submit"
                loading-auto
                :label="t('invoicing.screens.profile.save')"
              />
              <UButton
                color="neutral"
                variant="ghost"
                :label="t('invoicing.screens.profile.discard')"
                @click="reset"
              />
            </div>
          </UForm>
        </template>

        <template #codes>
          <div class="space-y-6 pt-4">
            <p class="text-sm text-muted">
              {{ t('invoicing.screens.profile.codes-help') }}
            </p>
            <PageSection
              v-for="g in groups"
              :key="g.module"
              :title="t(`${g.module}.module.name`)"
            >
              <RecordList :label="t(`${g.module}.module.name`)">
                <RecordListItem
                  v-for="a in g.accounts"
                  :key="a.id"
                  :muted="!a.used"
                  align="start"
                >
                  <template #name>
                    {{ a.name }} <span class="font-mono text-muted">({{ a.code }})</span>
                  </template>
                  <template #description>
                    <span v-if="!a.used">{{ t('invoicing.screens.profile.no-entries') }}</span>
                  </template>
                  <StatusBadge
                    v-if="a.used && !codeOf(a)?.code"
                    tone="warning"
                    :label="t('invoicing.screens.profile.unmapped')"
                  />
                  <template #below>
                    <div class="space-y-2">
                      <UForm
                        v-for="kind in [null, ...a.codes.filter(c => c.postingKind).map(c => c.postingKind)]"
                        :key="kind ?? ''"
                        :state="draftOf(a.id, kind)"
                        class="flex flex-wrap items-start gap-2"
                        novalidate
                        @submit="saveCode(a, kind)"
                      >
                        <span class="w-40 pt-1.5 text-sm text-muted">{{ kind ? t(`invoicing.screens.profile.kinds.${kind}`) : t('invoicing.screens.profile.every-kind') }}</span>
                        <UFormField :error="codeError[`${a.id}|${kind ?? ''}`] || undefined">
                          <UInput
                            v-model="draftOf(a.id, kind).code"
                            maxlength="50"
                            class="font-mono sm:w-40"
                            :placeholder="t('invoicing.screens.profile.code-placeholder')"
                            :aria-label="t('invoicing.screens.profile.code-for', { account: a.name })"
                          />
                        </UFormField>
                        <UInput
                          v-model="draftOf(a.id, kind).codeName"
                          maxlength="80"
                          class="sm:w-56"
                          :placeholder="t('invoicing.screens.profile.code-name-placeholder')"
                          :aria-label="t('invoicing.screens.profile.code-name-for', { account: a.name })"
                        />
                        <UButton
                          type="submit"
                          size="sm"
                          color="neutral"
                          variant="outline"
                          loading-auto
                          :label="t('invoicing.screens.profile.code-save')"
                        />
                        <IconButton
                          v-if="kind"
                          icon="i-lucide-x"
                          size="sm"
                          :label="t('invoicing.screens.profile.kind-remove', { kind: t(`invoicing.screens.profile.kinds.${kind}`) })"
                          @click="saveCode(a, kind, true)"
                        />
                      </UForm>
                      <div class="flex flex-wrap items-center gap-2">
                        <USelect
                          :model-value="addingKind(a.id)"
                          :items="POSTING_KINDS.filter(k => !a.codes.some(c => c.postingKind === k)).map(k => ({ value: k, label: t(`invoicing.screens.profile.kinds.${k}`) }))"
                          :placeholder="t('invoicing.screens.profile.kind-add')"
                          size="sm"
                          class="sm:w-64"
                          :aria-label="t('invoicing.screens.profile.kind-add')"
                          @update:model-value="adding[a.id] = String($event); addKind(a)"
                        />
                      </div>
                    </div>
                  </template>
                </RecordListItem>
              </RecordList>
            </PageSection>
          </div>
        </template>

        <template #tax>
          <div class="space-y-4 pt-4">
            <p class="text-sm text-muted">
              {{ t('invoicing.screens.profile.tax-help') }}
            </p>
            <UForm
              :state="form"
              class="space-y-3"
              novalidate
              @submit="save"
            >
              <UFormField
                v-for="c in data?.taxCodes ?? []"
                :key="c.code"
                :name="`tax-${c.code}`"
                :label="c.label"
                :hint="c.code"
              >
                <UInput
                  :model-value="form.taxMap[c.code] ?? ''"
                  maxlength="50"
                  class="sm:w-64"
                  @update:model-value="form.taxMap[c.code] = String($event)"
                />
              </UFormField>
              <UButton
                type="submit"
                loading-auto
                :label="t('invoicing.screens.profile.save')"
              />
            </UForm>
          </div>
        </template>
      </UTabs>
    </DataBoundary>

    <UModal
      v-model:open="previewOpen"
      :title="t('invoicing.screens.profile.preview')"
      :ui="{ content: 'sm:max-w-4xl' }"
    >
      <template #body>
        <RefusalNotice :refusal="previewRefusal" />
        <div
          v-if="preview"
          class="space-y-2"
        >
          <p class="text-sm text-muted">
            {{ t('invoicing.screens.profile.preview-help', { range: range(preview.from, preview.to), count: preview.rows, n: preview.rows }) }}
          </p>
          <pre class="overflow-x-auto rounded-md bg-elevated p-3 text-xs">{{ preview.lines.join('\n') }}</pre>
        </div>
      </template>
    </UModal>
  </PageFrame>
</template>
