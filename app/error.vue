<script setup lang="ts">
import type { NuxtError } from '#app'

// Inside the site chrome, so a mistyped show URL costs the page and not the rest of the theatre
// (K-133). No status code reaches the reader: copy-style section 6.
const props = defineProps<{ error: NuxtError }>()

const SAYS: Record<number, { title: string, says: string }> = {
  401: {
    title: 'Your sign-in has ended',
    says: 'Sign in again to carry on',
  },
  403: {
    title: 'That is not yours to open',
    says: 'Your account does not hold the permission this screen needs. If you think it should, ask the IT Manager.',
  },
  404: {
    title: 'There is nothing here',
    says: 'The page you asked for does not exist. It may have moved.',
  },
}

// A 403 with an enrol path is a role that holds the permission and only lacks a second factor
// (A-112): naming the missing permission there would be false (issue 897).
const enrol = computed(() => enrolPath(props.error))

const shown = computed(() => {
  if (enrol.value) {
    return {
      title: 'Set up your authenticator app',
      says: 'This role needs an authenticator app before it can be used. Set one up, then come back and try again.',
    }
  }
  return SAYS[props.error.statusCode ?? 0] ?? {
    title: 'Something went wrong',
    says: 'That did not work. Try again, and tell the IT Manager if it keeps happening.',
  }
})

const WAYS_ON = [
  { to: '/whats-on', label: 'See what\'s on' },
  { to: '/get-involved', label: 'Get involved' },
  { to: '/', label: 'Go to the home page' },
]
</script>

<template>
  <NuxtLayout name="default">
    <WayIn>
      <div class="space-y-4 text-center">
        <h1 class="nnt-headline text-2xl text-highlighted">
          {{ shown.title }}
        </h1>
        <p class="text-muted">
          {{ shown.says }}
        </p>

        <UButton
          v-if="enrol"
          :to="enrol"
          color="primary"
          icon="i-lucide-shield-check"
          @click="clearError({ redirect: enrol })"
        >
          Set up an authenticator app
        </UButton>

        <div
          class="flex flex-wrap justify-center gap-3"
          data-test="error-ways"
        >
          <UButton
            v-for="way in WAYS_ON"
            :key="way.to"
            :to="way.to"
            color="neutral"
            variant="subtle"
            @click="clearError({ redirect: way.to })"
          >
            {{ way.label }}
          </UButton>
        </div>
      </div>
    </WayIn>
  </NuxtLayout>
</template>
