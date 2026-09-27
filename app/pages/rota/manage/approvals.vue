<script setup lang="ts">
import { BOARD_WAITING_HREF } from '#shared/utils/rota-board'

definePageMeta({ middleware: 'console' })

// The approvals queue is the board's waiting filter (E-105 criterion 2), so this address forwards
// there; the board guards the route.
await navigateTo(BOARD_WAITING_HREF, { replace: true, redirectCode: 301 })
</script>

<template>
  <div />
</template>
