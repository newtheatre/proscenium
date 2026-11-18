<!-- Version history (screen 9): each published version, who published it and what changed. Any
     version opens to be read and tried as it was, and can be made the draft again. -->
<script setup lang="ts">
import type { Answers, Definition } from '../../../../../shared/engine'

interface Change { kind: 'added' | 'retired' | 'changed', impact: 'safe' | 'caution' | 'breaking', questionId: string, label: string, what: string[] }
interface Version { number: number, live: boolean, publishedAt: number, publishedBy: string | null, responses: number, summary: { impact: Change['impact'], changes: Change[] } }
interface History { form: { id: string, title: string, status: string, archived: boolean }, editRevision: number, versions: Version[] }

definePageMeta({ layout: 'console' })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { dateTime } = useDates()
const toast = useToast()
const undo = useUndo()
const route = useRoute()
const router = useRouter()
const formId = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<History>(() => `/api/forms/forms/${formId.value}/versions`, { key: `forms:versions:${formId.value}` })

const tone = { safe: 'success', caution: 'warning', breaking: 'danger' } as const
const words = (c: Change) => [t(`forms.screens.publish.kind-${c.kind}`), ...c.what.map(w => t(`forms.screens.publish.what.${w}`))].join(' · ')
const about = (v: Version) => [
  v.publishedBy ? t('forms.screens.versions.by-at', { who: v.publishedBy, when: dateTime(v.publishedAt) }) : dateTime(v.publishedAt),
  t('forms.screens.versions.responses', { count: v.responses }),
  v.number === 1 ? t('forms.screens.versions.first') : t('forms.screens.versions.changes', { count: v.summary.changes.length }),
].join(' · ')

// ---- one version, opened from the address ----
const openNumber = computed(() => Number(route.query.version) || null)
const version = computed(() => data.value?.versions.find(v => v.number === openNumber.value) ?? null)
const shown = ref<{ number: number, today: string | null, definition: Definition } | null>(null)
const answers = ref<Answers>({})
watch(openNumber, async (number) => {
  shown.value = null
  answers.value = {}
  if (!number) return
  try {
    shown.value = await $api<{ number: number, today: string | null, definition: Definition }>(`/api/forms/forms/${formId.value}/versions/${number}` as string)
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
    close()
  }
}, { immediate: true })
const open = (number: number) => router.replace({ query: { ...route.query, version: String(number) } })
const close = () => router.replace({ query: { ...route.query, version: undefined } })
const panel = computed({ get: () => !!openNumber.value, set: (v: boolean) => { if (!v) close() } })

// ---- making an earlier version the draft again: nothing is published, and it can be undone ----
const working = ref(false)
async function putDraft(definition: Definition) {
  const now = await $api<{ draft: { definition: Definition, editRevision: number } }>(`/api/forms/forms/${formId.value}` as string)
  await $api(`/api/forms/forms/${formId.value}/draft` as string, { method: 'PUT', body: { definition, editRevision: now.draft.editRevision } })
  return now.draft.definition
}
async function restore() {
  if (!shown.value) return
  const number = shown.value.number
  working.value = true
  try {
    const before = await putDraft(shown.value.definition)
    undo.offer(t('forms.screens.versions.restored', { n: number }), async () => { await putDraft(before) })
    close()
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
  working.value = false
}
</script>

<template>
  <PageFrame
    :title="t('forms.screens.versions.title')"
    :description="t('forms.screens.versions.help')"
    :trail="[{ label: t('forms.navigation.forms.label'), to: '/console/forms' }, ...(data ? [{ label: data.form.title, to: `/console/forms/${formId}` }] : [])]"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.versions.length"
        icon="i-lucide-history"
        :title="t('forms.screens.versions.none')"
        :description="t('forms.screens.versions.none-help')"
      />
      <RecordList
        v-else
        :label="t('forms.screens.versions.title')"
      >
        <RecordListItem
          v-for="v in data.versions"
          :key="v.number"
          icon="i-lucide-history"
          :name="t('forms.screens.versions.n', { n: v.number })"
          :description="about(v)"
        >
          <StatusBadge
            v-if="v.live"
            tone="success"
            :label="t('forms.screens.versions.live')"
          />
          <UButton
            :label="t('forms.screens.versions.open')"
            :aria-label="t('forms.screens.versions.open-n', { n: v.number })"
            size="sm"
            color="neutral"
            variant="subtle"
            @click="open(v.number)"
          />
        </RecordListItem>
      </RecordList>
    </DataBoundary>

    <USlideover
      v-model:open="panel"
      :title="openNumber ? t('forms.screens.versions.n', { n: openNumber }) : undefined"
      :description="version ? about(version) : undefined"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <div
          v-if="shown && version"
          class="space-y-6"
        >
          <section
            v-if="version.number > 1"
            class="space-y-2"
          >
            <h3 class="font-medium">
              {{ t('forms.screens.versions.what-changed') }}
            </h3>
            <RecordList
              v-if="version.summary.changes.length"
              :label="t('forms.screens.versions.what-changed')"
            >
              <RecordListItem
                v-for="c in version.summary.changes"
                :key="c.questionId"
                :name="c.label || t('forms.screens.builder.untitled')"
                :description="words(c)"
              >
                <StatusBadge
                  v-if="c.impact !== 'safe'"
                  :tone="tone[c.impact]"
                  :label="t(`forms.screens.publish.impact-${c.impact}`)"
                />
              </RecordListItem>
            </RecordList>
            <p
              v-else
              class="text-sm text-muted"
            >
              {{ t('forms.screens.publish.layout-only') }}
            </p>
          </section>
          <section class="space-y-2">
            <h3 class="font-medium">
              {{ t('forms.screens.versions.as-published') }}
            </h3>
            <p class="text-sm text-muted">
              {{ t('forms.screens.preview.help') }}
            </p>
            <div class="@container rounded-xl border border-default bg-default p-6">
              <FormsFill
                v-model="answers"
                :definition="shown.definition"
                :context="{ today: shown.today ?? '2000-01-01' }"
              />
            </div>
          </section>
        </div>
        <UProgress
          v-else
          size="xs"
        />
      </template>
      <template
        v-if="shown && data && !data.form.archived"
        #footer
      >
        <UButton
          :label="t('forms.screens.versions.restore')"
          icon="i-lucide-undo-2"
          color="neutral"
          variant="subtle"
          :loading="working"
          @click="restore"
        />
        <span class="text-sm text-muted">{{ t('forms.screens.versions.restore-help') }}</span>
      </template>
    </USlideover>
  </PageFrame>
</template>
