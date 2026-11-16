<!-- The members' area shell (UI-03): a top bar of sections on a laptop; below 640 pixels a bottom bar
     of the first four sections plus More. Sections come only from modules that are on, and each
     keeps the same place. The page is `/members/...`; for anyone who is not a member the guard has
     already answered "not found", so nothing here tests membership. -->
<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

const BOTTOM_SECTIONS = 4 // not-policy: the specification's four sections plus More

const { t } = useT()
const route = useRoute()
const { viewer } = useViewer()
const { data: brandData } = await useBrand()
const { data: navigation } = await useNavigation('members')
const name = computed(() => brandData.value?.name ?? t('core.public.default-name'))
const area = computed(() => viewer.value.membersName ?? t('core.menu.members'))

const sections = computed(() => (navigation.value?.items ?? []).map(i => ({ ...i, active: isCurrent(i, route.path) })))
const top = computed<NavigationMenuItem[]>(() => sections.value.map(i => ({ label: t(i.label), icon: i.icon, to: i.to, active: i.active, badge: i.count })))
const bottom = computed(() => sections.value.slice(0, sections.value.length > BOTTOM_SECTIONS ? BOTTOM_SECTIONS : sections.value.length))
const more = computed<DropdownMenuItem[]>(() => sections.value.slice(BOTTOM_SECTIONS).map(i => ({ label: t(i.label), icon: i.icon, to: i.to })))
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <SkipLink />
    <UHeader :title="name">
      <template #title>
        <span class="font-semibold">{{ name }}</span>
        <span class="ml-3 text-sm text-muted">{{ area }}</span>
      </template>
      <!-- A top bar on a laptop; below 640 pixels the bottom bar below takes over. -->
      <UNavigationMenu
        class="hidden sm:flex"
        :items="top"
        :aria-label="area"
      />
      <template #right>
        <AccountMenu />
      </template>
    </UHeader>

    <UMain
      id="main"
      tabindex="-1"
      class="flex-1 pb-20 outline-none sm:pb-0"
    >
      <slot />
    </UMain>

    <nav
      v-if="sections.length"
      :aria-label="area"
      class="fixed inset-x-0 bottom-0 z-40 flex border-t border-default bg-default sm:hidden"
    >
      <NuxtLink
        v-for="s in bottom"
        :key="s.id"
        :to="s.to"
        class="flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs"
        :class="s.active ? 'font-semibold text-primary' : 'text-muted'"
        :aria-current="s.active ? 'page' : undefined"
      >
        <UIcon
          :name="s.icon"
          class="size-5"
        />
        <span>{{ t(s.label) }}<UBadge
          v-if="s.count"
          :label="String(s.count)"
          size="sm"
          class="ml-1"
        /></span>
      </NuxtLink>
      <UDropdownMenu
        v-if="more.length"
        :items="more"
        :content="{ side: 'top', align: 'end' }"
      >
        <button
          type="button"
          class="flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 px-3 py-2 text-xs text-muted"
        >
          <UIcon
            name="i-lucide-ellipsis"
            class="size-5"
          />
          <span>{{ t('core.members.more') }}</span>
        </button>
      </UDropdownMenu>
    </nav>
  </div>
</template>
