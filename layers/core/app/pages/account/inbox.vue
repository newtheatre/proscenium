<!-- Inbox (C-30, AC-2): every message the theatre has sent this person, as a customer and, for a
     member, as a member. The members' area opens the same inbox. -->
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
