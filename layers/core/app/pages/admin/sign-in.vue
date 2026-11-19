<!-- Sign-in settings (identity spec part 6, Admin): first the outside sign-in providers, each a card
     with its own set-up; then the ways in, managed domains, session times and recovery, drawn from
     the settings registry as the page core.sign-in; and beneath them the Turnstile bot check's key. -->
<script setup lang="ts">
const { t } = useT()
const route = useRoute()
const highlight = computed(() => typeof route.query.setting === 'string' ? route.query.setting : undefined)
</script>

<template>
  <PageSettings
    page="core.sign-in"
    :title="t('core.sign-in-settings.title')"
    :highlight="highlight"
  >
    <template #before>
      <SignInProviders :highlight="highlight" />
    </template>
    <KeysCard :names="['CORE_TURNSTILE_SECRET_KEY']" />
  </PageSettings>
</template>
