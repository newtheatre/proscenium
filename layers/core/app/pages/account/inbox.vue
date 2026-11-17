<!-- Inbox, the audience side (C-30): the messages the theatre has sent this person as a customer. -->
<script setup lang="ts">
const { t } = useT()
</script>

<template>
  <PageFrame
    :title="t('core.inbox.title')"
    width="reading"
  >
    <InboxList side="audience" />
  </PageFrame>
</template>
