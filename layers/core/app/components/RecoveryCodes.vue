<!-- Recovery codes, shown once. The person confirms they kept them by typing one back (ID-14). -->
<script setup lang="ts">
import { callIdentity } from '../composables/useIdentity'

const props = defineProps<{ codes: string[], checkPath?: string }>()
const emit = defineEmits<{ kept: [code: string] }>()
const typed = ref('')
const wrong = ref(false)

async function confirm() {
  wrong.value = false
  if (props.checkPath) {
    const answer = await callIdentity<{ matches: boolean }>(props.checkPath, { code: typed.value })
    if (!answer.ok || !answer.data.matches) {
      wrong.value = true
      return
    }
  }
  emit('kept', typed.value)
}
</script>

<template>
  <section
    aria-labelledby="codes-heading"
    class="flex flex-col gap-4"
  >
    <h2
      id="codes-heading"
      class="font-semibold text-highlighted"
    >
      Your recovery codes
    </h2>
    <p class="text-sm text-muted">
      Keep these somewhere safe. Each one works once, if you lose your passkey. You will not see them again.
    </p>
    <ul class="grid grid-cols-2 gap-2 font-mono text-sm">
      <li
        v-for="code in codes"
        :key="code"
      >
        {{ code }}
      </li>
    </ul>
    <UForm
      :state="{ typed }"
      class="flex flex-col gap-4"
      @submit="confirm"
    >
      <UFormField
        label="Type one of the codes to show you have kept them"
        name="typed"
        :error="wrong ? 'That is not one of the codes above. Check it and try again.' : undefined"
      >
        <UInput
          v-model="typed"
          autocomplete="off"
          required
        />
      </UFormField>
      <UButton
        type="submit"
        block
      >
        I have kept them
      </UButton>
    </UForm>
  </section>
</template>
