<!-- The public shell (UI-01): the theatre's header and footer around a page rendered on the server.
     To restyle it, put a file at site/app/layouts/default.vue: it wins, with no other edit. Its
     links are the theatre's own, from site/content/navigation.yml. -->
<script setup lang="ts">
const { t } = useT()
const brand = await useBrand()
const site = await useSiteNavigation()
const route = useRoute()

const links = computed(() => [
  { label: t('core.public.whats-on'), to: '/whats-on' },
  ...site.value.header,
].map(l => ({ ...l, active: route.path === l.to || route.path.startsWith(`${l.to}/`) })))
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <SkipLink />
    <UHeader :title="brand.name">
      <template #title>
        <span class="font-semibold">{{ brand.name }}</span>
      </template>
      <UNavigationMenu
        :items="links"
        :aria-label="t('core.public.navigation')"
      />
      <template #right>
        <AccountMenu />
      </template>
      <template #body>
        <UNavigationMenu
          :items="links"
          orientation="vertical"
          :aria-label="t('core.public.navigation')"
        />
      </template>
    </UHeader>

    <UMain
      id="main"
      tabindex="-1"
      class="flex-1 outline-none"
    >
      <slot />
    </UMain>

    <!-- One shape for everybody: the same footer signed in or out. -->
    <footer class="border-t border-default py-8">
      <UContainer class="flex flex-col gap-4 text-sm sm:flex-row sm:items-start sm:justify-between">
        <nav :aria-label="t('core.public.footer-navigation')">
          <ul class="flex flex-wrap gap-x-5 gap-y-2">
            <li
              v-for="l in site.footer"
              :key="l.to"
            >
              <ULink
                :to="l.to"
                class="text-muted hover:text-highlighted"
              >
                {{ l.label }}
              </ULink>
            </li>
          </ul>
        </nav>
        <div class="space-y-1 text-muted">
          <p v-if="site.contact">
            {{ site.contact }}
          </p>
          <p v-if="site.credit">
            {{ site.credit }}
          </p>
        </div>
      </UContainer>
    </footer>
  </div>
</template>
