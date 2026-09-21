<script setup lang="ts">
// Public surfaces get the expressive kit; the chrome is stage black in both colour modes.
// That is one `dark` class on the subtree, never an override of slot classes.

// The header carries the visitor's few destinations from HEADER_NAV; the full public nav,
// editorial pages included, stays in the footer (D-103, J-111 criterion 4).
import { withoutPlaceholders } from '#shared/utils/editorial'
import { HEADER_NAV } from '#shared/utils/site-nav'

// The booking button already goes to what's on, so the entry is dropped from the rendering here
// rather than from the declaration, which the footer still reads in full (issue 1152 item 6).
const BOOKING_TO = '/whats-on'

const { account } = useAccount()
const unwritten = usePlaceholderPaths()

// The same filter the footer applies: a page awaiting the committee's copy is linked from neither
// end of the shell (D-103 criterion 6).
const links = computed(() => [
  ...withoutPlaceholders(HEADER_NAV.filter(entry => entry.to !== BOOKING_TO), unwritten.value)
    .map(entry => ({ label: entry.label, to: entry.to })),
  ...(account.value.signedIn ? [{ label: 'My NNT', to: '/my' }] : []),
])
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <div class="dark">
      <UHeader
        title="The Nottingham New Theatre"
        :ui="{ root: 'bg-default' }"
      >
        <template #title>
          <SiteWordmark />
        </template>

        <UNavigationMenu
          :items="links"
          aria-label="Primary"
        />

        <template #right>
          <!-- The help button is for somebody who is working, so it appears once there is a
               session behind it (J-109 criterion 1). -->
          <DocsLink v-if="account.signedIn" />
          <AuthStatus />
          <UButton
            size="sm"
            variant="poster"
            :to="BOOKING_TO"
            data-test="header-book"
          >
            Book tickets
          </UButton>
        </template>

        <!-- Nuxt UI does not carry the default slot into the mobile panel, so the panel is given
             the same links itself rather than being left empty (J-111 criterion 10). -->
        <template #body>
          <UNavigationMenu
            :items="links"
            orientation="vertical"
            aria-label="Primary"
            data-test="header-nav-mobile"
            class="-mx-2.5"
          />
          <UButton
            class="mt-6"
            variant="poster"
            :to="BOOKING_TO"
            block
          >
            Book tickets
          </UButton>
        </template>
      </UHeader>
    </div>

    <UMain class="grow">
      <slot />
    </UMain>

    <SiteFooter />
  </div>
</template>
