<!-- Sign-in providers, the second tab of Sign-in (SignInFrame): one card per outside provider, each
     set up in its own slide-over (SignInProviders). Settings search lands here for their settings. -->
<script setup lang="ts">
const { t } = useT()
const route = useRoute()
</script>

<template>
  <PageFrame
    :title="t('core.sign-in-providers.title')"
    :description="t('core.sign-in-providers.description')"
  >
    <SignInProviders :highlight="typeof route.query.setting === 'string' ? route.query.setting : undefined" />
  </PageFrame>
</template>
