<script setup lang="ts">
import { nightCacheKey } from '#shared/utils/night-cache'
import { onShiftLabel } from '#shared/utils/night-hub'
import { currentShowNight } from '#shared/utils/show-night'

// A phone held in a foyer is not a dashboard: a plain dark subtree, big targets, nothing that
// needs a mouse (docs/design-language.md). The hub is the navigation; there is no sidebar.
const route = useRoute()
const { account } = useAccount()

// The hub is the way back, so it does not offer a link to itself.
const atTheHub = computed(() => route.path === '/tonight')

const header = useNightHeader()
const authority = useNightAuthority()
const badge = computed(() => onShiftLabel(authority.value.via, account.value.user?.name))

resolveNightAuthority()

// Opening any show-night screen caches the emergency card, whole-night rather than venue-scoped
// since a shift holder resolves only one (0044). Best effort: no shift, nothing to prime.
onMounted(async () => {
  try {
    // Both generics load-bearing: the second, widened to string, keeps this under tsc's depth
    // limit once enough routes exist (0053 amendment).
    const card = await $fetch<unknown, string>('/api/tonight/emergency')
    await primeNightCache(nightCacheKey({ screen: 'emergency-card', night: currentShowNight(), wholeNight: true }), () => card)
  }
  catch { /* nothing to prime */ }
})
</script>

<template>
  <div class="dark flex min-h-screen flex-col bg-default text-default [color-scheme:dark]">
    <div class="mx-auto flex h-10 w-full max-w-md items-center justify-end px-2">
      <AuthStatus />
    </div>
    <header class="border-b border-default">
      <div class="mx-auto flex w-full max-w-md items-start gap-2 px-4 pb-3">
        <UButton
          v-if="!atTheHub"
          to="/tonight"
          variant="ghost"
          color="neutral"
          icon="i-lucide-arrow-left"
          aria-label="Back to tonight"
          class="min-h-12 min-w-12 -ml-2 justify-center"
          data-test="night-back"
        />
        <!-- The screen inside fills these in, and a layout renders before its page does on the
           server, so the first paint is the default and the mismatch is the design (Vue 3.5). -->
        <div
          class="min-w-0 grow"
          data-allow-mismatch
        >
          <p
            class="font-mono text-xs tracking-[0.2em] text-secondary uppercase"
            data-test="night-eyebrow"
          >
            {{ header.eyebrow }}
          </p>
          <h1
            class="nnt-headline truncate text-xl font-bold"
            data-test="night-title"
          >
            {{ header.title }}
          </h1>
          <p
            v-if="header.meta"
            class="truncate text-sm text-muted"
            data-test="night-meta"
          >
            {{ header.meta }}
          </p>
        </div>
        <UBadge
          v-if="badge"
          color="success"
          variant="subtle"
          class="mt-1 shrink-0"
          data-test="night-shift-badge"
        >
          {{ badge }}
        </UBadge>
      </div>
    </header>
    <main class="flex grow flex-col p-4">
      <slot />
    </main>
  </div>
</template>
