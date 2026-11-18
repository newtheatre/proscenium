<!-- Notifications (FH-6): a switch for each optional kind of message on the sides the person has,
     such as cover requests and night reports. A switch covers email and the inbox together. Messages
     about the person's own bookings, shifts and account are not listed, because they always come. -->
<script setup lang="ts">
interface Topic { id: string, module: string, side: 'audience' | 'members', on: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ topics: Topic[] }>('/api/core/me/notifications', { key: 'core:my-notifications' })

// A topic's words: <module>.notification-topics.<name>.label and .description.
const words = (topic: Topic, part: 'label' | 'description') => t(`${topic.module}.notification-topics.${topic.id.slice(topic.module.length + 1)}.${part}`)

const busy = ref<string | null>(null)
async function toggle(topic: Topic, on: boolean) {
  busy.value = topic.id
  try {
    await $api(`/api/core/me/notifications/${topic.id}` as '/api/core/me/notifications/:topic', { method: 'PUT', body: { on } })
    topic.on = on
    toast.add({ title: t(on ? 'core.me.notifications.now-on' : 'core.me.notifications.now-off', { topic: words(topic, 'label') }), color: 'success' })
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
  finally {
    busy.value = null
  }
}
</script>

<template>
  <PageFrame
    :title="t('core.me.notifications.title')"
    :description="t('core.me.notifications.intro')"
    :trail="[{ label: t('core.account.title'), to: '/account' }]"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.topics.length"
        icon="i-lucide-bell"
        :title="t('core.me.notifications.none')"
        :description="t('core.me.notifications.none-help')"
      />
      <RecordList
        v-else
        :label="t('core.me.notifications.title')"
      >
        <RecordListItem
          v-for="topic in data.topics"
          :key="topic.id"
          icon="i-lucide-bell"
          :name="words(topic, 'label')"
          :description="words(topic, 'description')"
        >
          <USwitch
            :model-value="topic.on"
            :loading="busy === topic.id"
            :disabled="busy !== null && busy !== topic.id"
            :aria-label="words(topic, 'label')"
            @update:model-value="toggle(topic, $event)"
          />
        </RecordListItem>
      </RecordList>
    </DataBoundary>
  </PageFrame>
</template>
