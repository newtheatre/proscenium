<!-- The two tabs of Admin > Roles (Matt, 21 November 2026): the roles people are given, and the
     access people get by themselves while something is true of them (the platform's facts). -->
<script setup lang="ts">
const { t } = useT()
const route = useRoute()
const items = computed(() => [
  { label: t('core.roles.tabs.roles'), value: '/admin/roles', icon: 'i-lucide-shield-user' },
  { label: t('core.roles.tabs.automatic'), value: '/admin/roles/automatic', icon: 'i-lucide-badge-check' },
])
const active = computed(() => route.path.startsWith('/admin/roles/automatic') ? '/admin/roles/automatic' : '/admin/roles')
</script>

<template>
  <UTabs
    :model-value="active"
    :items="items"
    :content="false"
    variant="link"
    :aria-label="t('core.roles.tabs.label')"
    :ui="{ list: 'overflow-x-auto overflow-y-hidden [scrollbar-width:none]', trigger: 'shrink-0', label: 'whitespace-nowrap overflow-visible' }"
    @update:model-value="to => navigateTo(String(to))"
  />
</template>
