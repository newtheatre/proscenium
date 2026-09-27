<script setup lang="ts">
import { saysScreenIsFor } from '#shared/utils/refusals'
import type { NuxtError } from '#app'
import type { Role } from '#shared/utils/roles'

// Inside the site chrome, so a mistyped show URL costs the page and not the rest of the theatre
// (K-133). No status code reaches the reader: copy-style section 6.
const props = defineProps<{ error: NuxtError }>()

const SAYS: Record<number, { title: string, says: string }> = {
  401: {
    title: 'Your sign-in has ended',
    says: 'Sign in again to carry on',
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
  // A signed-in refusal names who the screen is for, never the IT Manager (issue 1304, K-133).
  if (props.error.statusCode === 403) {
    const says = forRoles.value ? `${saysScreenIsFor(forRoles.value)} Ask them if you need something from it.` : saysScreenIsFor([])
    return { title: 'That is not yours to open', says }
  }
  return SAYS[props.error.statusCode ?? 0] ?? {
    title: 'Something went wrong',
    says: 'That did not work. Try again, and tell the IT Manager if it keeps happening.',
  }
})

// The roles a console refusal carries, read defensively: a server-rendered error's data arrives
// as text.
const forRoles = computed<Role[] | null>(() => {
  const data = typeof props.error.data === 'string' ? safeParse(props.error.data) : props.error.data
  const roles = (data as { roles?: unknown } | null | undefined)?.roles
  return Array.isArray(roles) && roles.length > 0 ? roles as Role[] : null
})

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  }
  catch {
    return null
  }
}

const { account } = useAccount()

const PUBLIC_WAYS = [
  { to: '/whats-on', label: 'See what\'s on' },
  { to: '/get-involved', label: 'Get involved' },
  { to: '/', label: 'Go to the home page' },
]

// Somebody signed in who was refused is on their way somewhere of their own: their page, or the
// night they may be working (issue 1304).
const WAYS_ON = computed(() => props.error.statusCode === 403 && account.value.signedIn
  ? [{ to: '/my', label: 'My NNT' }, { to: '/tonight', label: 'Tonight' }]
  : PUBLIC_WAYS)
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
