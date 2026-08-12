<script lang="ts" setup>
/**
 * Account overview — stage-door integration.
 *
 * Name and email belong to the central NNT account (shared across every NNT
 * site) and are edited there; this page shows what this site sees via the
 * shared session.
 */
const { user } = useUserSession()
const config = useRuntimeConfig()

definePageMeta({
  middleware: 'auth',
  title: 'Account',
  description: 'Your NNT account',
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <UPageCard
      title="Profile"
      description="Your NNT account is shared across all NNT sites — changes made there apply everywhere."
      variant="subtle"
    >
      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt class="text-muted">
          Name
        </dt>
        <dd>{{ user?.name }}</dd>
        <dt class="text-muted">
          Email
        </dt>
        <dd>
          {{ user?.email }}
          <UBadge
            :color="user?.verified ? 'success' : 'warning'"
            variant="subtle"
            size="sm"
            class="ml-2"
            :label="user?.verified ? 'Verified' : 'Not verified'"
          />
        </dd>
      </dl>

      <UButton
        :to="`${config.public.authBaseURL}/account`"
        external
        icon="i-lucide-external-link"
        class="self-start mt-4"
        label="Edit your NNT account"
      />
    </UPageCard>
  </div>
</template>
