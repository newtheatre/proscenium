<!-- The members' area shell (UI-03): a top bar of sections on a laptop; below 640 pixels the
     MembersTabBar takes over, once there are two places or more to move between. Sections come only
     from modules that are on, and each keeps the same place. The page is `/members/...`; for anyone who is not a member the guard has
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
// The bar along the bottom of a phone is for moving between places: with fewer than two it is left out.
const tabbed = computed(() => sections.value.length > 1)
const top = computed<NavigationMenuItem[]>(() => sections.value.map(i => ({ label: t(i.label), icon: i.icon, to: i.to, active: i.active, badge: i.count || undefined })))
</script>

<template>
  <div>
    <SkipLink />
    <UHeader :title="name">
      <!-- The area's name sits beside the theatre's link rather than inside it, so the link is named by
           what it shows; on a phone it gives way to the bell and the menu. -->
      <template #left>
        <ULink
          to="/"
          class="shrink-0 text-xl font-bold text-highlighted"
        >
          {{ name }}
        </ULink>
        <UBadge
          :label="area"
          color="neutral"
          class="max-sm:hidden"
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
      :class="['outline-none', tabbed && 'max-sm:pb-20']"
    >
      <slot />
    </UMain>

    <MembersTabBar
      v-if="tabbed"
      :sections="sections"
      :label="area"
    />
  </div>
</template>
