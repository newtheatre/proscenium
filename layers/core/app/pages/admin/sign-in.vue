<!-- Sign-in settings (identity spec part 6, Admin): the ways in, managed domains, session times and
     recovery, drawn from the settings registry as the page core.sign-in, and beneath them the keys
     sign-in uses: Google's client secret and the Turnstile bot check's secret key. -->
<script setup lang="ts">
const { t } = useT()
const route = useRoute()
</script>

<template>
  <PageSettings
    page="core.sign-in"
    :title="t('core.sign-in-settings.title')"
    :highlight="typeof route.query.setting === 'string' ? route.query.setting : undefined"
  >
    <KeysCard :names="['CORE_TURNSTILE_SECRET_KEY', 'CORE_GOOGLE_CLIENT_SECRET']" />
  </PageSettings>
</template>
