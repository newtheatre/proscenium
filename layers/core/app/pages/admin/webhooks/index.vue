<!-- Webhooks (C-49 to C-51; Site administration, Connections): every webhook, where it goes, what it
     is sent and whether it is working; then the webhook settings. Needs core.webhook.manage. -->
<script setup lang="ts">
import type { Webhook } from '../../../../server/webhooks/service'

const { t } = useT()
const route = useRoute()
const { brief } = useDates()
const { data, status, error, refresh } = await useAPI<{ webhooks: Webhook[] }>('/api/core/webhooks', { key: 'core:webhooks' })

const tone = { active: 'success', paused: 'neutral', failing: 'danger' } as const

function describe(hook: Webhook): string {
  const sent = hook.lastSuccessAt ? t('core.webhooks.last-success', { when: brief(hook.lastSuccessAt) }) : t('core.webhooks.never-sent')
  return [hook.host, t(`core.webhooks.format.${hook.format}`), t('core.webhooks.event-count', { count: hook.events.length }), sent].join(' · ')
}
</script>

<template>
  <PageFrame
    :title="t('core.webhooks.title')"
    :description="t('core.webhooks.description')"
    width="reading"
  >
    <template #primary>
      <UButton
        :label="t('core.webhooks.new')"
        icon="i-lucide-plus"
        to="/admin/webhooks/new"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.webhooks.length"
        icon="i-lucide-webhook"
        :title="t('core.webhooks.empty')"
        :description="t('core.webhooks.empty-help')"
      />
      <RecordList
        v-else
        :label="t('core.webhooks.title')"
      >
        <RecordListItem
          v-for="hook in data.webhooks"
          :key="hook.id"
          :name="hook.name"
          :to="`/admin/webhooks/${hook.id}`"
          :muted="hook.state === 'paused'"
          :description="describe(hook)"
        >
          <StatusBadge
            :tone="tone[hook.state]"
            :label="t(`core.webhooks.state.${hook.state}`)"
          />
        </RecordListItem>
      </RecordList>
    </DataBoundary>
    <SettingsSections
      screen="/admin/webhooks"
      :heading="t('core.webhooks.settings')"
      :highlight="typeof route.query.setting === 'string' ? route.query.setting : undefined"
    />
  </PageFrame>
</template>
