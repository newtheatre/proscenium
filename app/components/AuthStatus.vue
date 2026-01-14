<template>
  <div v-if="loggedIn">
    <UDropdownMenu
      :items="menuItems"
      :ui="{ content: 'w-48' }"
    >
      <UButton
        icon="i-lucide-user"
        color="neutral"
        variant="ghost"
      />
    </UDropdownMenu>
  </div>
  <div v-else>
    <UTooltip text="Login">
      <UButton
        icon="i-lucide-log-in"
        color="neutral"
        variant="ghost"
        to="/login"
      />
    </UTooltip>
  </div>
</template>

<script lang="ts" setup>
import type { DropdownMenuItem } from '@nuxt/ui'

const { loggedIn, user, clear } = useUserSession()

const isAdmin = computed(() => {
  return user.value?.roles?.includes('ADMIN') || false
})

const menuItems = computed(() => {
  const actionItems: DropdownMenuItem[] = [
    {
      label: 'My Account',
      icon: 'i-lucide-user-circle',
      to: '/account',
    },
  ]

  // Add Admin Dashboard option for admins
  if (isAdmin.value) {
    actionItems.push({
      label: 'Admin Dashboard',
      icon: 'i-lucide-layout-dashboard',
      to: '/admin',
    })
  }

  // Add logout option
  actionItems.push({
    label: 'Logout',
    icon: 'i-lucide-log-out',
    color: 'error',
    async onSelect() {
      await $fetch('/api/auth/logout', { method: 'POST' })
      await clear()

      await navigateTo('/login')
    },
  })

  const items: DropdownMenuItem[][] = [
    [
      {
        label: user.value?.name || 'User',
        type: 'label',
      },
    ],
    actionItems,
  ]

  return items
})
</script>
