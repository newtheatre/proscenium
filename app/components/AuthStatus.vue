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
        :to="loginHref"
        external
      />
    </UTooltip>
  </div>
</template>

<script lang="ts" setup>
import type { DropdownMenuItem } from '@nuxt/ui'
import { isStaff } from '~~/shared/utils/abilities'

const { loggedIn, user, clear } = useUserSession()
const config = useRuntimeConfig()
const route = useRoute()
// useRequestURL resolves on both server and client; window.location does not,
// and this header is server-rendered on first load.
const requestURL = useRequestURL()

// Hosted login (stage-door), returning to the current page. Dev: /dev-login.
const loginHref = computed(() => {
  if (import.meta.dev) return '/dev-login'
  return `${config.public.authBaseURL}/login?redirect=${encodeURIComponent(requestURL.origin + route.fullPath)}`
})

const showAdminLink = computed(() => user.value ? isStaff(user.value) : false)

const menuItems = computed(() => {
  const actionItems: DropdownMenuItem[] = [
    {
      label: 'My Account',
      icon: 'i-lucide-user-circle',
      to: '/account',
    },
  ]

  if (showAdminLink.value) {
    actionItems.push({
      label: 'Admin Dashboard',
      icon: 'i-lucide-layout-dashboard',
      to: '/admin',
    })
  }

  actionItems.push({
    label: 'Logout',
    icon: 'i-lucide-log-out',
    color: 'error',
    async onSelect() {
      // Logout is estate-wide and owned by the auth service. A same-site form POST
      // carries the cookie; dev sessions clear locally.
      if (import.meta.dev) {
        await clear()
        await navigateTo('/')
        return
      }
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = `${config.public.authBaseURL}/logout?redirect=${encodeURIComponent(window.location.origin)}`
      document.body.appendChild(form)
      form.submit()
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
