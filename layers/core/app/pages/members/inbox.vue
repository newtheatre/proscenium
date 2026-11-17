<!-- Inbox, the members' side (C-30): messages for this person as a member, never mixed with the
     audience side's. -->
<script setup lang="ts">
const { t } = useT()
</script>

<template>
  <PageFrame
    :title="t('core.inbox.title')"
    width="reading"
  >
    <InboxList side="members" />
  </PageFrame>
</template>
