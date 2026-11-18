<!-- The members' area shell (UI-03): a top bar of sections on a laptop; below 640 pixels the
     MembersTabBar takes over. Sections come only from modules that are on, and each
     keeps the same place. The page is `/members/...`; for anyone who is not a member the guard has
     already answered "not found", so nothing here tests membership. -->
<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t } = useT()
const route = useRoute()
const { viewer } = useViewer()
const { data: brandData } = await useBrand()
const { data: navigation } = await useNavigation('members')
const name = computed(() => brandData.value?.name ?? t('core.public.default-name'))
const area = computed(() => viewer.value.membersName ?? t('core.menu.members'))

const sections = computed(() => (navigation.value?.items ?? []).map(i => ({ ...i, active: isCurrent(i, route.path) })))
const top = computed<NavigationMenuItem[]>(() => sections.value.map(i => ({ label: t(i.label), icon: i.icon, to: i.to, active: i.active, badge: i.count })))
</script>

<template>
  <div>
    <SkipLink />
    <UHeader :title="name">
      <!-- The badge sits beside the home link, not in it, so the link's name is the words it shows. -->
      <template #left>
        <ULink
          to="/"
          class="flex shrink-0 items-end gap-1.5 text-xl font-bold text-highlighted"
        >
          {{ name }}
        </ULink>
        <UBadge
          :label="area"
          color="neutral"
          class="ms-2"
        />
      </template>
      <!-- A top bar on a laptop; below 640 pixels the bottom bar takes over. -->
      <UNavigationMenu
        class="max-sm:hidden"
        :items="top"
        :aria-label="area"
      />
      <template #right>
        <InboxBell side="members" />
        <AccountMenu />
      </template>
    </UHeader>

    <UMain
      id="main"
      tabindex="-1"
      :class="['outline-none', sections.length > 1 && 'max-sm:pb-20']"
    >
      <slot />
    </UMain>

    <MembersTabBar
      :sections="sections"
      :label="area"
    />
  </div>
</template>
