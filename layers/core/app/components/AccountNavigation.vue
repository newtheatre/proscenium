<!-- My account's menu: the Overview, then the entries modules add, in two groups (life at the
     theatre, then the account's upkeep; ACCOUNT_GROUP_ORDER). An entry with something that needs
     the person carries a warning badge, so it shows from every page of the account. PageFrame draws
     it beside every account page on a laptop; on a phone the overview's own list takes its place. -->
<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { ACCOUNT_GROUP_ORDER } from '../../shared/navigation'

const { t } = useT()
const route = useRoute()
const { data: navigation } = await useNavigation('account')

const items = computed<NavigationMenuItem[][]>(() => {
  const entries = navigation.value?.items ?? []
  const groups = ACCOUNT_GROUP_ORDER.map(group => entries.filter(e => (e.group ?? 'theatre') === group)).filter(g => g.length)
  return [
    [{ label: t('core.account.overview'), icon: 'i-lucide-house', to: '/account', active: route.path === '/account' }],
    ...groups.map(group => [
      { type: 'label' as const, label: t(`core.account.groups.${group[0]!.group ?? 'theatre'}`) },
      ...group.map(e => ({
        label: t(e.label),
        icon: e.icon,
        to: e.to,
        active: isCurrent(e, route.path),
        ...(e.attention ? { badge: { 'label': String(e.attention), 'color': 'warning' as const, 'variant': 'subtle' as const, 'aria-label': t('core.account.needs-you', { count: e.attention }) } } : {}),
      })),
    ]),
  ]
})
</script>

<template>
  <UNavigationMenu
    :items="items"
    orientation="vertical"
    :aria-label="t('core.account.title')"
    :ui="{ linkLabel: 'whitespace-normal overflow-visible' }"
  />
</template>
