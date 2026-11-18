<!-- Inbox in the members' area (C-30, AC-2): the same one inbox as My account's, with the same
     messages and the same count, in the members' shell. -->
<script setup lang="ts">
const { t } = useT()
</script>

<template>
  <PageFrame
    :title="t('core.inbox.title')"
    width="reading"
  >
    <InboxList />
  </PageFrame>
</template>
