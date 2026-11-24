<!-- Who is giving (D5): a guest's email for the thanks, an optional name, how they would like to be
     thanked in public, and a note to the theatre that is never shown publicly. -->
<script setup lang="ts">
defineProps<{ signedIn: boolean }>()
const name = defineModel<string>('name', { required: true })
const email = defineModel<string>('email', { required: true })
const acknowledgeAs = defineModel<string>('acknowledgeAs', { required: true })
const message = defineModel<string>('message', { required: true })
const { t } = useT()
</script>

<template>
  <FieldGroup :title="t('fundraising.give.about-you')">
    <UFormField
      v-if="!signedIn"
      name="email"
      :label="t('fundraising.give.email')"
      :help="t('fundraising.give.email-help')"
      required
    >
      <UInput
        v-model="email"
        type="email"
        autocomplete="email"
        maxlength="254"
      />
    </UFormField>
    <UFormField
      name="name"
      :label="t('fundraising.give.name')"
    >
      <UInput
        v-model="name"
        autocomplete="name"
        maxlength="120"
      />
    </UFormField>
    <UFormField
      name="acknowledgeAs"
      :label="t('fundraising.give.acknowledge')"
      :help="t('fundraising.give.acknowledge-help')"
    >
      <UInput
        v-model="acknowledgeAs"
        maxlength="60"
      />
    </UFormField>
    <UFormField
      name="message"
      :label="t('fundraising.give.message')"
      :help="t('fundraising.give.message-help')"
    >
      <UTextarea
        v-model="message"
        maxlength="500"
        :rows="3"
      />
    </UFormField>
  </FieldGroup>
</template>
