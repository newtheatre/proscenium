<!-- Admin > Sign-in, framed as a module's page is (ModuleFrame): the title, then its tabs, Settings
     and Providers (Matt, 19 November: providers in a tab of their own, as on Payments), and the open
     tab's page in the slot as an embedded screen. The admin layout draws it round /admin/sign-in/*. -->
<script setup lang="ts">
defineSlots<{ default?: () => unknown }>()

const { t } = useT()
const route = useRoute()
const items = computed(() => [
  { label: t('core.sign-in-tabs.settings'), value: '/admin/sign-in', icon: 'i-lucide-settings' },
  { label: t('core.sign-in-tabs.providers'), value: '/admin/sign-in/providers', icon: 'i-lucide-log-in' },
])
const active = computed(() => route.path.startsWith('/admin/sign-in/providers') ? '/admin/sign-in/providers' : '/admin/sign-in')
</script>

<template>
  <PageFrame
    :title="t('core.sign-in-settings.title')"
    width="reading"
  >
    <UTabs
      :model-value="active"
      :items="items"
      :content="false"
      variant="link"
      :aria-label="t('core.sign-in-tabs.label')"
      :ui="{ list: 'overflow-x-auto overflow-y-hidden [scrollbar-width:none]', trigger: 'shrink-0', label: 'whitespace-nowrap overflow-visible' }"
      @update:model-value="to => navigateTo(String(to))"
    />
    <EmbeddedScreens>
      <slot />
    </EmbeddedScreens>
  </PageFrame>
</template>
