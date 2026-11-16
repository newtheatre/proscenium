<!-- Errors: a page that does not exist (which is also how a shell the viewer has no business in
     answers), a refusal that says why and what would let the person through, and a failure. -->
<script setup lang="ts">
import type { NuxtError } from '#app'
import type { RefusalView } from './composables/useRefusal'

const props = defineProps<{ error: NuxtError<Partial<RefusalView> | undefined> }>()
const { t } = useT()
const route = useRoute()

const refused = computed(() => props.error.statusCode === 403 && props.error.data?.reason)
const missing = computed(() => props.error.statusCode === 404)
const title = computed(() => refused.value ? t('core.refused.title') : missing.value ? t('core.not-found.title') : t('core.failed.title'))
useHead({ title })
const home = () => clearError({ redirect: '/' })
</script>

<template>
  <UApp>
    <NuxtLayout name="default">
      <UContainer class="py-16">
        <div class="mx-auto max-w-xl space-y-4">
          <h1 class="text-2xl font-semibold text-highlighted">
            {{ title }}
          </h1>
          <RefusalPanel
            v-if="refused"
            :refusal="{ reason: phrase(props.error.data?.reason) ?? '', remedy: phrase(props.error.data?.remedy), code: props.error.data?.code }"
            :sign-in-to="`/sign-in?next=${encodeURIComponent(route.fullPath)}`"
          />
          <p
            v-else-if="missing"
            class="text-muted"
          >
            {{ t('core.not-found.description') }}
          </p>
          <p
            v-else
            class="text-muted"
          >
            {{ t('core.failed.reason') }}
          </p>
          <UButton
            :label="t('core.error.home')"
            color="neutral"
            variant="outline"
            @click="home"
          />
        </div>
      </UContainer>
    </NuxtLayout>
  </UApp>
</template>
