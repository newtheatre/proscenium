<script setup lang="ts">
import { BOARD_WAITING_HREF } from '#shared/utils/rota-board'

// The approvals queue is the board's waiting filter (E-105 criterion 2). It forwards before any
// guard, so everybody gets the board's own refusal, naming who it is for (0214).
await navigateTo(BOARD_WAITING_HREF, { replace: true, redirectCode: 301 })
</script>

<template>
  <div />
</template>
