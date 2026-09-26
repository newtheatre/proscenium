<script setup lang="ts">
import { BOARD_WAITING_HREF } from '#shared/utils/rota-board'

// The approvals queue became the rota board's "Waiting for confirmation" filter (issue 1365), so
// an old link or a bookmark lands there; the board guards the route it forwards to.
await navigateTo(BOARD_WAITING_HREF, { replace: true, redirectCode: 301 })
</script>

<template>
  <div />
</template>
