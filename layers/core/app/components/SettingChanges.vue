<!-- A list of changes to settings, newest first (settings build brief, "History and revert"): who,
     when, what it was and what it became, and a Revert that sets the setting back through the
     ordinary save. A sensitive setting's values are never shown and it has no Revert. Used for one
     setting in a drawer and for every setting on the Settings history screen. -->
<script setup lang="ts">
import { formatDuration } from '../../kit/duration'

export interface SettingChange {
  id: string
  key: string
  module: string
  page: string | null
  screen: string | null
  labelKey: string | null
  at: number
  by: { id: string, name: string | null } | null
  reason: string | null
  sensitive: boolean
  before: unknown
  after: unknown
  revertible: boolean
}

const props = defineProps<{
  /** The query to ask the history route: `key` for one setting; `module`, `page`, `actor` for the screen. */
  query: Record<string, string | undefined>
  /** The kind of the one setting, so durations read as words. */
  kind?: string
}>()
const emit = defineEmits<{ (e: 'reverted', change: SettingChange): void }>()

const { $api } = useNuxtApp()
const { t, te } = useT()
const toast = useToast()
const { confirm } = useConfirm()

const rows = ref<SettingChange[]>([])
const next = ref<string | null>(null)
const status = ref<'loading' | 'ready' | 'failed'>('loading')
const more = ref(false)
const reverting = ref<string | null>(null)

async function load(append = false) {
  if (append) more.value = true
  else status.value = 'loading'
  try {
    const answer = await $api<{ changes: SettingChange[], next: string | null }>('/api/core/settings/history', {
      query: { ...Object.fromEntries(Object.entries(props.query).filter(([, v]) => v)), before: append ? next.value ?? undefined : undefined },
    })
    rows.value = append ? [...rows.value, ...answer.changes] : answer.changes
    next.value = answer.next
    status.value = 'ready'
  }
  catch {
    status.value = 'failed'
  }
  finally {
    more.value = false
  }
}
watch(() => props.query, () => load(), { immediate: true, deep: true })

const when = (at: number) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(at)
const who = (c: SettingChange) => c.by ? (c.by.name ?? t('core.settings-history.someone')) : t('core.settings-history.system')
const name = (c: SettingChange) => c.labelKey && te(c.labelKey) ? t(c.labelKey) : c.key

/** A stored value as words. Durations and rates are stored in seconds. */
function valueText(value: unknown, kind?: string): string {
  if (value === null || value === undefined) return t('core.settings-history.unset')
  if (typeof value === 'boolean') return value ? t('core.settings-page.on') : t('core.settings-page.off')
  if (kind === 'duration' && typeof value === 'number') return formatDuration(value)
  if (kind === 'rate' && typeof value === 'object') {
    const { count, per } = value as { count: number, per: number }
    return t('core.settings-page.rate', { count, period: formatDuration(per) })
  }
  if (Array.isArray(value)) return value.join(', ') || t('core.settings-history.empty')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

async function revert(change: SettingChange) {
  if (reverting.value) return
  reverting.value = change.id
  try {
    await send(change, false)
  }
  catch (e) {
    const failure = toRefusal(e)
    // A setting that asks again before it changes asks here too, naming what it will go back to.
    if (failure.code === 'core.setting.confirm-needed') {
      const ok = await confirm({
        verb: t('core.settings-history.revert'),
        thing: name(change),
        consequence: t('core.settings-history.confirm', { setting: name(change), to: valueText(change.before, props.kind) }),
        button: t('core.settings-history.revert-button'),
      })
      if (ok) await send(change, true).catch(err => toast.add({ title: toRefusal(err).reason, color: 'error', icon: 'i-lucide-circle-alert' }))
    }
    else {
      toast.add({ title: failure.reason, color: 'error', icon: 'i-lucide-circle-alert' })
    }
  }
  finally {
    reverting.value = null
  }
}
async function send(change: SettingChange, confirmed: boolean) {
  await $api(`/api/core/settings/history/${change.id}/revert`, { method: 'POST', body: confirmed ? { confirm: true } : {} })
  toast.add({ title: t('core.settings-history.reverted', { setting: name(change) }), color: 'success', icon: 'i-lucide-circle-check' })
  emit('reverted', change)
  await load()
}
</script>

<template>
  <div>
    <p
      v-if="status === 'failed'"
      role="alert"
    >
      {{ t('core.settings-history.unavailable') }}
      <UButton
        color="neutral"
        variant="link"
        :label="t('core.failed.retry')"
        @click="load()"
      />
    </p>
    <p
      v-else-if="status === 'loading'"
      role="status"
    >
      {{ t('core.settings-history.loading') }}
    </p>
    <EmptyState
      v-else-if="!rows.length"
      :title="t('core.settings-history.none')"
      icon="i-lucide-history"
    />
    <template v-else>
      <ol class="divide-y divide-default">
        <li
          v-for="c in rows"
          :key="c.id"
          class="space-y-1 py-4 first:pt-0"
        >
          <p class="font-medium">
            <NuxtLink
              v-if="!query.key"
              :to="c.screen ?? undefined"
              class="hover:underline"
            >
              {{ name(c) }}
            </NuxtLink>
            <template v-else>
              {{ t('core.settings-history.by-on', { who: who(c), when: when(c.at) }) }}
            </template>
          </p>
          <p
            v-if="!query.key"
            class="text-sm text-muted"
          >
            {{ t('core.settings-history.by-on', { who: who(c), when: when(c.at) }) }}
          </p>
          <p
            v-if="c.sensitive"
            class="text-sm"
          >
            {{ t('core.settings-history.sensitive') }}
          </p>
          <p
            v-else
            class="text-sm"
          >
            {{ t('core.settings-history.from-to', { from: valueText(c.before, kind), to: valueText(c.after, kind) }) }}
          </p>
          <p
            v-if="c.reason"
            class="text-sm text-muted"
          >
            {{ t('core.settings-history.reason', { reason: c.reason }) }}
          </p>
          <UButton
            v-if="c.revertible"
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide-undo-2"
            :label="t('core.settings-history.revert')"
            :aria-label="t('core.settings-history.revert-named', { setting: name(c), when: when(c.at) })"
            :loading="reverting === c.id"
            :disabled="reverting !== null"
            @click="revert(c)"
          />
        </li>
      </ol>
      <UButton
        v-if="next"
        class="mt-4"
        color="neutral"
        variant="outline"
        :label="t('core.settings-history.more')"
        :loading="more"
        @click="load(true)"
      />
    </template>
  </div>
</template>
