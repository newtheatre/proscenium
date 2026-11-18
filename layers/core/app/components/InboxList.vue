<!-- The one inbox (C-30, AC-2; core part 6): messages newest first, unread ones marked, from every
     side the person has. A member can narrow it to the members' side or to bookings and account.
     Opening one marks it read and follows its link, which always stays inside the application.
     "Mark all read", and archive with Undo; the archived ones are a tab away. Used by My account's
     Inbox and the members' area's, which are the same messages and the same count. -->
<script setup lang="ts">
import type { InboxItem, InboxPage } from '../../server/notifications/inbox'

const { t } = useT()
const { has } = useViewer()
const route = useRoute()
const { $api } = useNuxtApp()
const { brief } = useDates()
const { toRefusal } = useRefusal()
const undo = useUndo()
const toast = useToast()

const view = ref<'current' | 'archived'>('current')
const views = computed(() => [
  { value: 'current', label: t('core.inbox.current') },
  { value: 'archived', label: t('core.inbox.archived') },
])
// A member sees both sides together and may narrow them; anyone else has only the audience side.
const member = computed(() => has('members'))
type Shown = 'all' | 'audience' | 'members'
const asked = route.query.side
const side = ref<Shown>(asked === 'audience' || asked === 'members' ? asked : 'all')
const sides = computed(() => [
  { value: 'all', label: t('core.inbox.side-all') },
  { value: 'members', label: t('core.inbox.side-members') },
  { value: 'audience', label: t('core.inbox.side-audience') },
])
const { data, status, error, refresh } = await useAPI<InboxPage>('/api/core/me/inbox', {
  key: 'core:inbox',
  query: computed(() => ({ side: member.value ? side.value : 'all', archived: view.value === 'archived' ? '1' : '0' })),
})
// Older messages fetched with "Show older", after the first page.
const older = ref<InboxItem[]>([])
const more = ref(false)
watch(data, (page) => {
  older.value = []
  more.value = page?.more ?? false
}, { immediate: true })
const items = computed(() => [...(data.value?.items ?? []), ...older.value])

// The bell and the menu's count follow what happens here.
const recount = () => Promise.all([refreshNuxtData('core:inbox-unread'), refreshNuxtData('core:navigation:members'), refreshNuxtData('core:navigation:account')])

async function showOlder() {
  try {
    const page = await $api<InboxPage>('/api/core/me/inbox', { query: { side: member.value ? side.value : 'all', archived: view.value === 'archived' ? '1' : '0', before: items.value.at(-1)?.id } })
    older.value.push(...page.items)
    more.value = page.more
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}

async function open(item: InboxItem) {
  try {
    if (!item.read) {
      await $api(`/api/core/me/inbox/${item.id}/read`, { method: 'POST' })
      item.read = true
      void recount()
    }
    if (item.link) await navigateTo(item.link)
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}

async function readAll() {
  try {
    await $api('/api/core/me/inbox/read-all', { method: 'POST', body: { side: member.value ? side.value : 'all' } })
    toast.add({ title: t('core.inbox.all-read'), color: 'success' })
    await Promise.all([refresh(), recount()])
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}

async function setArchived(item: InboxItem, archived: boolean) {
  try {
    await $api(`/api/core/me/inbox/${item.id}/archive`, { method: 'POST', body: { archived } })
    undo.offer(t(archived ? 'core.inbox.archived-toast' : 'core.inbox.restored-toast', { title: item.title }), () => setArchived(item, !archived))
    await Promise.all([refresh(), recount()])
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-3">
        <UTabs
          v-model="view"
          :items="views"
          :content="false"
          size="sm"
          variant="link"
          :aria-label="t('core.inbox.which')"
        />
        <USelect
          v-if="member"
          v-model="side"
          :items="sides"
          size="sm"
          class="w-48"
          :aria-label="t('core.inbox.side')"
        />
      </div>
      <UButton
        v-if="view === 'current' && (data?.unread ?? 0) > 0"
        :label="t('core.inbox.read-all')"
        icon="i-lucide-check-check"
        color="neutral"
        variant="outline"
        @click="readAll"
      />
    </div>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!items.length"
        icon="i-lucide-inbox"
        :title="t(view === 'current' ? 'core.inbox.empty' : 'core.inbox.empty-archived')"
        :description="view === 'current' ? t('core.inbox.empty-help') : undefined"
      />
      <RecordList
        v-else
        :label="t(view === 'current' ? 'core.inbox.title' : 'core.inbox.archived')"
      >
        <RecordListItem
          v-for="item in items"
          :key="item.id"
          :icon="item.read ? 'i-lucide-mail-open' : 'i-lucide-mail'"
        >
          <template #name>
            <button
              type="button"
              class="text-start hover:underline focus-visible:underline"
              :class="item.read ? 'font-normal' : 'font-semibold text-highlighted'"
              @click="open(item)"
            >
              <span
                v-if="!item.read"
                class="sr-only"
              >{{ t('core.inbox.unread') }}</span>
              {{ item.title }}
            </button>
          </template>
          <template #description>
            <span>{{ brief(item.createdAt) }}<template v-if="item.body"> · {{ item.body }}</template></span>
          </template>
          <IconButton
            :label="t(item.archived ? 'core.inbox.restore' : 'core.inbox.archive', { title: item.title })"
            :icon="item.archived ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
            @click="setArchived(item, !item.archived)"
          />
        </RecordListItem>
      </RecordList>
      <div
        v-if="more"
        class="flex justify-center"
      >
        <UButton
          :label="t('core.inbox.older')"
          color="neutral"
          variant="ghost"
          @click="showOlder"
        />
      </div>
    </DataBoundary>
  </div>
</template>
