<!-- ::access-application, for the theatre's own access page (ID-38; identity spec part 6): the same
     "Apply" button My account carries. A visitor who is signed out is asked to sign in first; one who
     has applied is taken to where their application stands. Nothing shows while the scheme is off. -->
<script setup lang="ts">
const { t } = useT()
const { viewer } = useViewer()
const { data: settings } = await usePublicSettings()

const enabled = computed(() => settings.value?.['core.access-scheme.enabled']?.value !== false)
const name = computed(() => String(settings.value?.['core.access-scheme.name']?.value ?? ''))
// Only a signed-in visitor's own application is asked about; nothing is fetched for anybody else.
const { data: mine } = await useFetch<{ enabled: boolean, application?: { status: string } | null }>('/api/core/me/access', {
  key: 'core:my-access-summary',
  immediate: viewer.value.signedIn,
  default: () => ({ enabled: true, application: null }),
})
const applied = computed(() => viewer.value.signedIn && !!mine.value?.application)
const to = computed(() => viewer.value.signedIn
  ? (applied.value ? '/account/access' : '/account/access?apply')
  : `/sign-in?next=${encodeURIComponent('/account/access?apply')}`)
</script>

<template>
  <div
    v-if="enabled"
    class="not-prose my-6"
  >
    <UButton
      :to="to"
      size="lg"
      icon="i-lucide-accessibility"
      :label="applied ? t('core.access.public.see', { scheme: name }) : t('core.access.public.apply', { scheme: name })"
    />
  </div>
</template>
