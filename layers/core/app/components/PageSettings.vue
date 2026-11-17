<!-- The Settings page type (UI-14): generated from the settings registry, so a module writes no
     settings screen. The sections themselves are SettingsSections, which a bespoke screen also uses
     for the settings it manages. A setting the viewer may read but not change is shown read-only
     with who can change it. -->
<script setup lang="ts">
const props = defineProps<{
  /** The page of settings to draw, by id (`core.sign-in`, `core.advanced`, `gallery.settings`). */
  page: string
  title: string
  trail?: { label: string, to: string }[]
  /** A setting to scroll into view and highlight, from settings search. */
  highlight?: string
}>()

const { t } = useT()
const advanced = computed(() => props.page === 'core.advanced')
const onlyChanged = ref(false)
</script>

<template>
  <PageFrame
    :title="title"
    :trail="trail"
    width="reading"
  >
    <SettingsSearch />
    <UAlert
      v-if="advanced"
      class="my-6"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('core.settings-page.advanced-warning-title')"
      :description="t('core.settings-page.advanced-warning')"
    />
    <USwitch
      v-model="onlyChanged"
      class="my-4"
      :label="t('core.settings-page.changed-only')"
    />
    <SettingsSections
      :page="page"
      :highlight="highlight"
      :only-changed="onlyChanged"
    />
  </PageFrame>
</template>
