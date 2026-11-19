<!-- NNT ONLY, TEMPORARY: remove after 8 December 2026 (see site/app/utils/old-codes.ts).
     Pass emails from the old system link here; see pages/qr/[token].vue. -->
<script setup lang="ts">
const route = useRoute()
const token = String(route.params.token ?? '')
if (!/^pass:[\w-]+\.[\w-]+$/i.test(token)) throw createError({ statusCode: 404, fatal: true })
const url = useRequestURL()
const code = `${url.origin}/passes/${token}`
useSeoMeta({ title: 'Your pass', robots: 'noindex' })
</script>

<template>
  <OldTicketCode
    :code="code"
    kind="pass"
  />
</template>
