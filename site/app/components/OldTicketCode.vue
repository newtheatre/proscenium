<!-- NNT ONLY, TEMPORARY: remove after 8 December 2026 (see site/app/utils/old-codes.ts).
     A ticket or pass code from the old booking system, shown again for the door. -->
<script setup lang="ts">
defineProps<{ code: string, kind: 'booking' | 'pass' }>()
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="kind === 'pass' ? 'Your pass' : 'Your tickets'"
        :description="kind === 'pass'
          ? 'Your pass has moved to our new booking system. Show this code at the door, as before.'
          : 'Your booking has moved to our new booking system. Show this code at the door, as before.'"
      />
      <UPageBody>
        <div class="flex flex-col items-start gap-6">
          <QrCode
            :value="code"
            :label="kind === 'pass' ? 'Your pass code' : 'Your ticket code'"
          />
          <p class="max-w-prose text-muted">
            To see your booking, sign in with the email address you booked with and open
            <ULink
              to="/account/tickets"
              class="text-primary"
            >My tickets</ULink>.
            If anything looks wrong, write to the box office at
            <ULink
              to="mailto:boxoffice@newtheatre.org.uk"
              class="text-primary"
            >boxoffice@newtheatre.org.uk</ULink>.
          </p>
        </div>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
