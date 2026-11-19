<!-- Sign-in providers, a tab of Admin > Sign-in: one card per outside provider, each set up in its
     own slide-over (SignInProviders). Settings search lands here for a provider's settings. -->
<script setup lang="ts">
const { t } = useT()
const route = useRoute()
</script>

<template>
  <PageFrame
    :title="t('core.sign-in-settings.title')"
    width="reading"
  >
    <template #toolbar>
      <SignInTabs />
    </template>
    <SignInProviders :highlight="typeof route.query.setting === 'string' ? route.query.setting : undefined" />
  </PageFrame>
</template>
