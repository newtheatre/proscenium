<script setup lang="ts">
import { can } from '#shared/utils/abilities'
import { MEMBER_NAV, SHELL_NAV } from '#shared/utils/site-nav'
import type { NavEntry } from '#shared/utils/site-nav'
import type { DropdownMenuItem } from '@nuxt/ui'

// The one component every shell renders, so it is where the shells reach each other (0040).
const { account, refresh } = useAccount()
const viewer = useViewer()

// The sidebar footer is 210px wide, so side by side there wraps the name and the button both.
defineProps<{ stacked?: boolean }>()

const shells = computed(() => SHELL_NAV.filter(entry => can(viewer.value, entry.ability)))

async function signOut(): Promise<void> {
  await $fetch('/api/auth/sign-out', { method: 'POST' })
  await refresh()
  await navigateTo('/')
}

const entry = (item: NavEntry): DropdownMenuItem => ({ label: item.label, icon: item.icon, to: item.to })

const items = computed<DropdownMenuItem[][]>(() => [
  [{ label: account.value.user?.name ?? '', type: 'label' as const }],
  MEMBER_NAV.map(entry),
  [...shells.value.map(entry), { label: 'Back to the site', icon: 'i-lucide-home', to: '/' }],
  [{
    label: 'Sign out',
    icon: 'i-lucide-log-out',
    onSelect: signOut,
    ui: { itemLeadingIcon: 'shrink-0' },
    class: 'sign-out',
  }],
])
</script>

<template>
  <div
    class="flex gap-2"
    :class="stacked ? 'w-full flex-col items-stretch' : 'items-center'"
  >
    <UDropdownMenu
      v-if="account.signedIn"
      :items="items"
      :content="{ align: stacked ? 'start' : 'end' }"
      :ui="{ content: 'w-56' }"
    >
      <UButton
        data-test="account-menu"
        size="sm"
        variant="ghost"
        icon="i-lucide-circle-user"
        trailing-icon="i-lucide-chevron-down"
        :block="stacked"
        :class="stacked ? 'justify-start truncate' : ''"
      >
        {{ account.user?.name }}
      </UButton>
    </UDropdownMenu>
    <UButton
      v-else
      size="sm"
      variant="ghost"
      to="/sign-in"
    >
      Sign in
    </UButton>
  </div>
</template>
