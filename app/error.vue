<script setup lang="ts">
import type { NuxtError } from '#app'

// Calm intensity and none of the expressive kit: an error is not a moment for personality.
const props = defineProps<{ error: NuxtError }>()

const SAYS: Record<number, { title: string, says: string }> = {
  403: {
    title: 'That is not yours to open',
    says: 'Your account does not hold the permission this screen needs. If you think it should, ask the IT Manager.',
  },
  404: {
    title: 'There is nothing here',
    says: 'The page you asked for does not exist. It may have moved.',
  },
}

const shown = computed(() => SAYS[props.error.statusCode ?? 0] ?? {
  title: 'Something went wrong',
  says: 'That did not work. Try again, and tell the IT Manager if it keeps happening.',
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-6">
    <div class="w-full max-w-md space-y-4 text-center">
      <p class="font-mono text-sm text-muted">
        {{ error.statusCode }}
      </p>
      <h1 class="text-xl font-semibold">
        {{ shown.title }}
      </h1>
      <p class="text-muted">
        {{ shown.says }}
      </p>
      <UButton
        to="/"
        icon="i-lucide-arrow-left"
        @click="clearError({ redirect: '/' })"
      >
        Back to the site
      </UButton>
    </div>
  </div>
</template>
