<script setup lang="ts">
import { withoutPlaceholders } from '#shared/utils/editorial'
import { SITE_ADDRESS } from '#shared/utils/seo'
import { ACCOUNT_NAV, MY_NAV, PUBLIC_GROUPS, PUBLIC_NAV } from '#shared/utils/site-nav'
import type { NavEntry } from '#shared/utils/site-nav'

// Stage black in both colour modes, done by marking the subtree rather than overriding slot
// classes (docs/design-language.md).
const { account } = useAccount()

// The footer keeps one shape for everybody: a signed-out visitor who followed a link still
// arrives where they meant to, rather than finding the link was never there (0040).
function href(entry: NavEntry): string {
  return account.value.signedIn ? entry.to : `/sign-in?next=${encodeURIComponent(entry.to)}`
}

const unwritten = usePlaceholderPaths()

// The public half groups by the heading each entry declares (0040), and a page the committee has
// not written yet is left out of every column until it has copy (D-103 criterion 6).
const publicColumns = computed(() => PUBLIC_GROUPS.map(heading => ({
  label: heading as string,
  links: withoutPlaceholders(PUBLIC_NAV.filter(entry => entry.group === heading), unwritten.value),
  public: true,
})))

const columns = computed(() => [
  // The same names the navigation uses: the member area is My NNT wherever it is named (0040).
  { label: 'My NNT', links: MY_NAV, public: false },
  { label: 'Account', links: ACCOUNT_NAV, public: false },
  ...publicColumns.value,
].filter(column => column.links.length > 0))

const year = new Date().getFullYear()
</script>

<template>
  <div class="dark">
    <UFooter
      :ui="{ root: 'bg-default' }"
      data-test="site-footer"
    >
      <template #left>
        <div class="flex flex-col gap-3">
          <SiteWordmark gold />
          <p class="max-w-xs text-sm text-muted">
            The country's only entirely student-run theatre, in {{ SITE_ADDRESS.addressLocality }}.
          </p>
          <!-- Not the sticker variant: the footer is on every view, and the sticker is a budget
               of one per view that a public page should be free to spend on itself. -->
          <UBadge
            color="secondary"
            variant="subtle"
            class="self-start"
            data-test="footer-centenary"
          >
            100 years, 1926 to 2026
          </UBadge>
        </div>
      </template>
      <template #right>
        <nav
          class="flex flex-wrap gap-x-10 gap-y-6"
          aria-label="Footer"
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
              :to="column.public ? entry.to : href(entry)"
              class="text-sm text-muted hover:text-default"
            >
              {{ entry.label }}
            </ULink>
          </div>
        </nav>
      </template>
      <template #bottom>
        <UContainer>
          <div class="flex flex-wrap items-center justify-between gap-2 py-4 text-xs text-muted">
            <span>&copy; {{ year }} The Nottingham New Theatre</span>
            <span class="font-mono">newtheatre.org.uk</span>
          </div>
        </UContainer>
      </template>
    </UFooter>
  </div>
</template>
