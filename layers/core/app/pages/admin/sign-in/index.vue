<!-- Sign-in settings (identity spec part 6, Admin), the first tab of Sign-in (SignInFrame): the ways
     in, managed domains, session times and recovery, drawn from the settings registry as the page
     core.sign-in, and beneath them the Turnstile bot check's key. -->
<script setup lang="ts">
const { t } = useT()
const route = useRoute()
</script>

<template>
  <PageSettings
    page="core.sign-in"
    :title="t('core.sign-in-tabs.settings-title')"
    :highlight="typeof route.query.setting === 'string' ? route.query.setting : undefined"
  >
    <KeysCard :names="['CORE_TURNSTILE_SECRET_KEY']" />
  </PageSettings>
</template>
