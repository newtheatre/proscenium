<!-- The shell's bell (C-30): the unread count of the shell's side, and the way to its inbox. Only
     for someone signed in; the public shell and My account show the audience side, the members'
     area the members' side. -->
<script setup lang="ts">
const props = defineProps<{ side: 'audience' | 'members' }>()
const { t } = useT()
const { data } = await useAPI<{ signedIn: boolean, audience: number, members: number }>('/api/core/me/inbox/unread', {
  key: 'core:inbox-unread',
  default: () => ({ signedIn: false, audience: 0, members: 0 }),
})
const count = computed(() => data.value?.[props.side] ?? 0)
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
