<!-- NNT ONLY, TEMPORARY: remove after 8 December 2026 (see site/app/utils/old-codes.ts).
     Booking emails from the old system link here. Their bookings were moved across, and the door
     still reads the old code, so this page shows that code again and says where to find the booking
     now. Nothing is looked up: the page holds only the address already in the email. -->
<script setup lang="ts">
const route = useRoute()
const token = String(route.params.token ?? '')
if (!/^[0-9a-f]{32}\.[\w-]+$/i.test(token)) throw createError({ statusCode: 404, fatal: true })
const url = useRequestURL()
const code = `${url.origin}/qr/${token}`
useSeoMeta({ title: 'Your ticket', robots: 'noindex' })
</script>

<template>
  <OldTicketCode
    :code="code"
    kind="booking"
  />
</template>
