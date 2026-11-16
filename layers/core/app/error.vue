<!-- Errors: a page that does not exist (which is also how a shell the viewer has no business in
     answers), a refusal that says why and what would let the person through, and a failure. -->
<script setup lang="ts">
import type { NuxtError } from '#app'
import type { RefusalView } from './utils/refusal'

const props = defineProps<{ error: NuxtError<Partial<RefusalView> | undefined> }>()
const { t } = useT()
const route = useRoute()

const refused = computed(() => props.error.statusCode === 403 && props.error.data?.reason)
const missing = computed(() => props.error.statusCode === 404)
const title = computed(() => refused.value ? t('core.refused.title') : missing.value ? t('core.not-found.title') : t('core.failed.title'))
useHead({ title })
const home = () => clearError({ redirect: '/' })
const description = computed(() => refused.value ? undefined : missing.value ? t('core.not-found.description') : t('core.failed.reason'))
</script>

<template>
  <UApp>
    <NuxtLayout name="default">
      <UError
        as="div"
        :error="{ statusCode: error.statusCode, statusMessage: title, message: description }"
        :ui="{ links: 'flex-col items-center' }"
      >
        <!-- The refusal is an alert, which cannot sit in the message's paragraph, so it leads the links. -->
        <template #links>
          <RefusalPanel
            v-if="refused"
            :refusal="{ reason: phrase(props.error.data?.reason) ?? '', remedy: phrase(props.error.data?.remedy), code: props.error.data?.code }"
            :sign-in-to="`/sign-in?next=${encodeURIComponent(route.fullPath)}`"
          />
          <UButton
            :label="t('core.error.home')"
            color="neutral"
            variant="outline"
            @click="home"
          />
        </template>
      </UError>
    </NuxtLayout>
  </UApp>
</template>
