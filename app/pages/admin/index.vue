<script setup lang="ts">
definePageMeta({ layout: 'admin', title: 'Overview' })

// Route middleware is rendering convenience only; the server guard is what actually refuses
// (docs/architecture.md). A 403 here means the guard did its job.
const { account } = useAccount()
</script>

<template>
  <div v-if="account.signedIn">
    <p class="text-muted">
      Signed in as {{ account.user?.name }}.
    </p>
    <p class="mt-2 text-sm text-muted">
      Nothing is built here yet. The screens arrive with the stories that need them.
    </p>
  </div>
  <UAlert
    v-else
    color="warning"
    variant="subtle"
    title="Not signed in"
    description="Sign in to reach the admin screens."
  />
</template>
