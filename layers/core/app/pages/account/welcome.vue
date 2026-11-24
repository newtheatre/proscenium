<!-- The welcome step after the first sign-in of an account with no name. It asks what to call the
     person and whether they are under 18 (C-74: only the day they turn 18 is kept), then goes on to
     the passkey offer if there is one, or to where they were going. -->
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
const under18 = ref(false)
const turns18On = ref('')
const nameSchema = z.object({ name: z.string().trim().min(1).max(120), under18: z.boolean(), turns18On: z.string() }) // not-policy: the column's own length
  .refine(v => !v.under18 || !!v.turns18On, { path: ['turns18On'], message: t('core.age.turns-missing') })
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
  if (under18.value) {
    const age = await callIdentity<{ recorded: boolean }>('/api/core/me/age', { turns18On: turns18On.value }, {}, 'PUT')
    if (!age.ok) {
      refusal.value = age.refusal
      nameForm.value?.setErrors(fieldErrors(age.refusal))
      return
    }
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
      :state="{ name, under18, turns18On }"
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
      <UCheckbox
        v-model="under18"
        name="under18"
        :label="t('core.age.under-self')"
        :description="t('core.welcome.under-18-help')"
      />
      <UFormField
        v-if="under18"
        name="turns18On"
        :label="t('core.age.turns-self')"
        :help="t('core.age.turns-help')"
        required
      >
        <FieldDate v-model="turns18On" />
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
