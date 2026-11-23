<!-- The welcome step after the first sign-in of an account with no name. It asks what to call the
     person, then goes on to the passkey offer if there is one, or to where they were going. -->
<script setup lang="ts">
import { z } from 'zod'
import type { Refusal } from '../../utils/identity'

const { t } = useT()
useSeoMeta({ title: () => t('core.welcome.title') })
const route = useRoute()
const next = nextPath(route.query.next) ?? '/'
const offerPasskey = route.query.passkey === '1'
const refusal = ref<Refusal | null>(null)
const name = ref('')
const nameSchema = z.object({ name: z.string().trim().min(1).max(120) }) // not-policy: the column's own length
const nameForm = useTemplateRef('nameForm')
// The account shell's guard has already sent a signed-out visitor to sign in (middleware/access.global.ts).
const { data: me } = await useAPI<{ signedIn: boolean, addresses?: { address: string, verified: boolean }[] }>('/api/core/me', { key: 'core:me' })
const address = computed(() => me.value?.addresses?.find(a => a.verified)?.address)

function goOn() {
  if (offerPasskey) return navigateTo({ path: '/account/passkey', query: { next } })
  return navigateTo(next)
}

async function save() {
  refusal.value = null
  const answer = await callIdentity<{ updated: boolean }>('/api/core/me', { name: name.value.trim() }, {}, 'PATCH')
  if (!answer.ok) {
    refusal.value = answer.refusal
    nameForm.value?.setErrors(fieldErrors(answer.refusal))
    return
  }
  await refreshNuxtData()
  return goOn()
}
</script>

<template>
  <IdentityCard
    :title="t('core.welcome.title')"
    :description="address ? t('core.welcome.signed-in-as', { address }) : t('core.welcome.ask')"
  >
    <RefusalNotice :refusal="refusal" />
    <UForm
      ref="nameForm"
      :schema="nameSchema"
      :state="{ name }"
      class="flex flex-col gap-4"
      novalidate
      @submit="save"
    >
      <UFormField
        :label="t('core.welcome.name')"
        name="name"
      >
        <UInput
          v-model="name"
          autocomplete="name"
          maxlength="120"
        />
      </UFormField>
      <UButton
        type="submit"
        block
        loading-auto
        :label="t('core.welcome.continue')"
      />
    </UForm>
    <UButton
      block
      color="neutral"
      variant="link"
      :label="t('core.welcome.skip')"
      @click="goOn()"
    />
  </IdentityCard>
</template>
