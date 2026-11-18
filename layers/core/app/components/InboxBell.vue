<!-- The shell's bell (C-30, AC-2): the unread count of the person's one inbox, every side they
     have, and the way to it. Only for someone signed in; the members' area opens its own door to
     the same inbox. -->
<script setup lang="ts">
defineProps<{ side: 'audience' | 'members' }>()
const { t } = useT()
const { data } = await useAPI<{ signedIn: boolean, audience: number, members: number, total: number }>('/api/core/me/inbox/unread', {
  key: 'core:inbox-unread',
  default: () => ({ signedIn: false, audience: 0, members: 0, total: 0 }),
})
const count = computed(() => data.value?.total ?? 0)
const label = computed(() => count.value ? t('core.inbox.bell-unread', { count: count.value }) : t('core.inbox.bell'))
</script>

<template>
  <UChip
    v-if="data?.signedIn"
    :text="count > 99 ? '99+' : count"
    :show="count > 0"
    size="3xl"
    inset
  >
    <IconButton
      :label="label"
      icon="i-lucide-bell"
      :to="side === 'members' ? '/members/inbox' : '/account/inbox'"
    />
  </UChip>
</template>
