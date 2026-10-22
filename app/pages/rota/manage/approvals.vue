<script setup lang="ts">
// The approvals queue is the board's waiting filter (E-105 criterion 2): a route redirect runs
// before any guard, so everybody gets the board's own refusal (0214). Kept equal to BOARD_WAITING_HREF.
definePageMeta({ redirect: '/rota/manage/shifts?waiting=true' })
</script>

<template>
  <div />
</template>
