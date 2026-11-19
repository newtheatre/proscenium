<!-- The tabs of Admin > Sign-in, drawn as a module's tabs are: the settings, and the sign-in
     providers (Matt, 19 November: providers in a tab of their own, as on Payments). -->
<script setup lang="ts">
const { t } = useT()
const route = useRoute()
const items = computed(() => [
  { label: t('core.sign-in-tabs.settings'), value: '/admin/sign-in', icon: 'i-lucide-settings' },
  { label: t('core.sign-in-tabs.providers'), value: '/admin/sign-in/providers', icon: 'i-lucide-log-in' },
])
const active = computed(() => route.path.startsWith('/admin/sign-in/providers') ? '/admin/sign-in/providers' : '/admin/sign-in')
</script>

<template>
  <UTabs
    :model-value="active"
    :items="items"
    :content="false"
    variant="link"
    :aria-label="t('core.sign-in-tabs.label')"
    :ui="{ list: 'overflow-x-auto overflow-y-hidden [scrollbar-width:none]', trigger: 'shrink-0', label: 'whitespace-nowrap overflow-visible' }"
    @update:model-value="to => navigateTo(String(to))"
  />
</template>
