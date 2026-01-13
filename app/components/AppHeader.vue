<template>
  <UHeader title="Nottingham New Theatre">
    <template #title>
      <UColorModeImage
        light="/images/logos/anniversary-grey.png"
        dark="/images/logos/anniversary-white.png"
        alt="Nottingham New Theatre Logo"
        height="100"
      />
    </template>

    <UNavigationMenu
      :items="links"
      orientation="horizontal"
    />

    <template #right>
      <div class="flex gap-4">
        <div class="hidden md:flex items-center gap-2">
          <template
            v-for="button in buttons"
            :key="button.label"
          >
            <UButton
              :to="button.to"
              :color="button.color"
              :label="button.label"
            />
          </template>
        </div>
        <UColorModeButton />
        <!-- <AuthStatus /> TODO: Add auth component -->
      </div>
    </template>

    <!-- Mobile menu -->
    <template #body>
      <UNavigationMenu
        :items="allNavigationItems"
        orientation="vertical"
      />
    </template>
  </UHeader>
</template>

<script lang="ts" setup>
import type { NavigationMenuItem, ButtonProps } from '@nuxt/ui'

// Navigation links (non-button links)
const links: NavigationMenuItem[] = [
  {
    label: 'About',
    to: '/about',
  },
  {
    label: 'StuFF',
    to: '/festival',
  },
  {
    label: 'Alumni',
    to: '/alumni',
  },
  {
    label: 'Technical',
    to: '/technical',
  },
]

// Button links
const buttons: ButtonProps[] = [
  {
    label: 'Get Involved',
    to: '/get-involved',
    color: 'primary',
  },
  {
    label: 'What\'s On',
    to: '/whats-on',
    color: 'secondary',
  },
]

// All items for mobile menu
const allNavigationItems = [
  ...links,
  ...buttons.map(button => ({
    label: button.label,
    to: button.to,
  })),
]
</script>
