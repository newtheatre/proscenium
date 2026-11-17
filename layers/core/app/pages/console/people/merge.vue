<!-- Merge accounts (ID-32; identity spec part 6): choose the account to keep and the one to merge into
     it with the person picker, see both side by side with what would move, and confirm. The merge
     settles at once and moves other modules' rows in the background; Merges shows it, with undo
     while its window lasts. `?survivorId=` starts with the account to keep chosen. -->
<script setup lang="ts">
import type { RefusalView } from '../../../utils/refusal'

definePageMeta({ layout: 'console' })

interface Side { id: string, name: string | null, preferredName: string | null, createdAt: number, claimed: boolean, disabled: boolean }
interface Preview { survivor: Side | null, mergedAccount: Side | null, moves: { table: string, column: string, action: string, rows: number }[] }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const route = useRoute()

const survivorId = ref<string | undefined>(typeof route.query.survivorId === 'string' ? route.query.survivorId : undefined)
const mergedAccountId = ref<string | undefined>()
const preview = ref<Preview | null>(null)
const refusal = ref<RefusalView | null>(null)
const busy = ref(false)

const labelOf = (s: Side | null) => s?.preferredName || s?.name || t('core.merges.unnamed')
const day = (ms: number) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(ms)
const moving = computed(() => (preview.value?.moves ?? []).reduce((n, m) => n + m.rows, 0))

watch([survivorId, mergedAccountId], async ([keep, merge]) => {
  preview.value = null
  refusal.value = null
  if (!keep || !merge) return
  try {
    preview.value = await $api<Preview>('/api/core/accounts/merge', { query: { survivorId: keep, mergedAccountId: merge } })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}, { immediate: true })

async function merge() {
  if (!preview.value?.survivor || !preview.value.mergedAccount) return
  if (!await confirm({
    verb: t('core.merge.verb'),
    thing: t('core.merges.thing', { merged: labelOf(preview.value.mergedAccount), survivor: labelOf(preview.value.survivor) }),
    consequence: t('core.merge.consequence'),
    button: t('core.merge.button'),
  })) return
  busy.value = true
  refusal.value = null
  try {
    await $api('/api/core/accounts/merge', { method: 'POST', body: { survivorId: survivorId.value, mergedAccountId: mergedAccountId.value } })
    toast.add({ title: t('core.merge.done'), color: 'success' })
    await navigateTo('/console/people/merges')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <PageFrame
    :title="t('core.merge.title')"
    :description="t('core.merge.intro')"
    :trail="[{ label: t('core.navigation.merges.label'), to: '/console/people/merges' }]"
    width="reading"
  >
    <div class="space-y-6">
      <PageSection :title="t('core.merge.choose')">
        <div class="space-y-4">
          <UFormField
            :label="t('core.merge.keep')"
            :help="t('core.merge.keep-help')"
          >
            <PersonPicker
              v-model="survivorId"
              :exclude="mergedAccountId ? [mergedAccountId] : []"
            />
          </UFormField>
          <UFormField
            :label="t('core.merge.into')"
            :help="t('core.merge.into-help')"
          >
            <PersonPicker
              v-model="mergedAccountId"
              :exclude="survivorId ? [survivorId] : []"
            />
          </UFormField>
        </div>
      </PageSection>

      <RefusalNotice :refusal="refusal" />

      <PageSection
        v-if="preview?.survivor && preview.mergedAccount"
        :title="t('core.merge.preview')"
      >
        <div class="grid gap-4 sm:grid-cols-2">
          <div
            v-for="[side, heading] in ([[preview.survivor, 'core.merge.kept'], [preview.mergedAccount, 'core.merge.merged']] as const)"
            :key="side.id"
            class="space-y-1 rounded-lg border border-default p-4"
          >
            <p class="text-sm text-muted">
              {{ t(heading) }}
            </p>
            <p class="font-semibold text-highlighted">
              {{ labelOf(side) }}
            </p>
            <p class="text-sm">
              {{ side.claimed ? t('core.merge.since', { date: day(side.createdAt) }) : t('core.picker.unclaimed') }}
            </p>
            <StatusBadge
              v-if="side.disabled"
              tone="warning"
              :label="t('core.picker.disabled')"
            />
          </div>
        </div>
        <p class="text-sm">
          {{ moving ? t('core.merge.moves', { count: moving }) : t('core.merge.moves-none') }}
        </p>
        <template #footer>
          <UButton
            icon="i-lucide-merge"
            :loading="busy"
            :label="t('core.merge.button')"
            @click="merge()"
          />
        </template>
      </PageSection>
    </div>
  </PageFrame>
</template>
