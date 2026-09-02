<script setup lang="ts">
import { MEMBER_NAV, PUBLIC_NAV } from '#shared/utils/site-nav'
import type { NavEntry } from '#shared/utils/site-nav'

// Stage black in both colour modes, done by marking the subtree rather than overriding slot
// classes (docs/design-language.md).
const { account } = useAccount()

// The footer keeps one shape for everybody: a signed-out visitor who followed a link still
// arrives where they meant to, rather than finding the link was never there (0040).
function href(entry: NavEntry): string {
  return account.value.signedIn ? entry.to : `/sign-in?next=${encodeURIComponent(entry.to)}`
}

const columns = computed(() => [
  { label: 'My theatre', links: MEMBER_NAV },
  { label: 'The theatre', links: PUBLIC_NAV },
].filter(column => column.links.length > 0))
</script>

<template>
  <div class="dark">
    <UFooter :ui="{ root: 'bg-default' }">
      <template #left>
        <p class="text-sm text-muted">
          The Nottingham New Theatre, the country's only entirely student-run theatre.
        </p>
      </template>
      <template #right>
        <nav
          class="flex flex-wrap gap-x-10 gap-y-4"
          data-test="footer-links"
        >
          <div
            v-for="column in columns"
            :key="column.label"
            class="flex flex-col gap-1"
          >
            <!-- Stage black inherits a foreground that measures 1.88:1 here, so the heading names
                 its own colour the way every other element in this subtree does (K-101). -->
            <p class="text-sm font-semibold text-default">
              {{ column.label }}
            </p>
            <ULink
              v-for="entry in column.links"
              :key="entry.to"
              :to="href(entry)"
              class="text-sm text-muted hover:text-default"
            >
              {{ entry.label }}
            </ULink>
          </div>
        </nav>
      </template>
    </UFooter>
  </div>
</template>
