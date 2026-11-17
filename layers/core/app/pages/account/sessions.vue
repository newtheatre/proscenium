<!-- Where you are signed in (ID-13; identity spec part 6): each browser with its device, when it was
     signed in and last used, and which is this one. Ending one takes effect on its next request;
     ending this one signs the person out here, so the app is reloaded as a sign-out does. -->
<script setup lang="ts">
import type { RefusalView } from '../../utils/refusal'

interface Session { id: string, device: string, startedAt: number, lastUsedAt: number, strong: boolean, current: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ sessions: Session[] }>('/api/core/me/sessions', { key: 'core:my-sessions' })

const { dateTime: when } = useDates()
const refusal = ref<RefusalView | null>(null)
const others = computed(() => (data.value?.sessions ?? []).filter(s => !s.current).length)

async function end(session: Session) {
  if (!await confirm({
    verb: t('core.me.sessions.end-verb'),
    thing: session.device,
    consequence: session.current ? t('core.me.sessions.end-this-consequence') : t('core.me.sessions.end-consequence'),
  })) return
  refusal.value = null
  try {
    await $api(`/api/core/me/sessions/${session.id}` as '/api/core/me/sessions/:id', { method: 'DELETE', body: {} })
    if (session.current) return reloadNuxtApp({ path: '/', persistState: false })
    toast.add({ title: t('core.me.sessions.ended'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

async function endOthers() {
  if (!await confirm({
    verb: t('core.me.sessions.end-others-verb'),
    thing: t('core.me.sessions.end-others-thing'),
    consequence: t('core.me.sessions.end-others-consequence'),
    button: t('core.me.sessions.end-others'),
  })) return
  refusal.value = null
  try {
    await $api('/api/core/me/sessions/end-others', { method: 'POST', body: {} })
    toast.add({ title: t('core.me.sessions.others-ended'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame
    :title="t('core.me.sessions.title')"
    :description="t('core.me.sessions.intro')"
    :trail="[{ label: t('core.account.title'), to: '/account' }]"
    width="reading"
  >
    <template #primary>
      <UButton
        v-if="others"
        color="neutral"
        variant="outline"
        icon="i-lucide-log-out"
        :label="t('core.me.sessions.end-others')"
        @click="endOthers()"
      />
    </template>
    <div class="space-y-6">
      <RefusalNotice :refusal="refusal" />
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <RecordList
          v-if="data"
          :label="t('core.me.sessions.title')"
        >
          <RecordListItem
            v-for="s in data.sessions"
            :key="s.id"
            :icon="s.strong ? 'i-lucide-shield-check' : 'i-lucide-monitor-smartphone'"
            :name="s.device"
            :description="`${t('core.me.sessions.started', { date: when(s.startedAt) })}, ${t('core.me.sessions.last-used', { date: when(s.lastUsedAt) })}`"
          >
            <div class="flex flex-wrap items-center justify-end gap-2">
              <StatusBadge
                v-if="s.current"
                tone="info"
                :label="t('core.me.sessions.this-one')"
              />
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                :label="t('core.me.sessions.end')"
                :aria-label="`${t('core.me.sessions.end')} ${s.device}`"
                @click="end(s)"
              />
            </div>
          </RecordListItem>
        </RecordList>
      </DataBoundary>
    </div>
  </PageFrame>
</template>
