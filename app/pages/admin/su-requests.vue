<script setup lang="ts">
// The two queues became one (C-122). Kept as a redirect because officers were emailed this path.
definePageMeta({ layout: 'admin', middleware: 'signed-in', redirect: '/admin/requests?kind=unlisted' })
</script>

<template>
  <div />
</template>
