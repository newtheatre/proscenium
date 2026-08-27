<script setup lang="ts">
const props = defineProps<{ attemptId: string }>()
const emit = defineEmits<{ answered: [] }>()

const CODE_LENGTH = 6

const attempt = ref(props.attemptId)
const digits = ref<string[]>([])
const recoveryCode = ref('')
const usingRecoveryCode = ref(false)
const notice = ref<string | null>(null)
const working = ref(false)

// A wrong code costs the code and not the password step: the route hands back a fresh attempt
// and the screen stays here (A-111 criterion 2).
async function answer(code: string): Promise<void> {
  if (working.value || !code) return
  working.value = true
  notice.value = null

  try {
    await $fetch('/api/auth/mfa/challenge', { method: 'POST', body: { attemptId: attempt.value, code } })
    emit('answered')
  }
  catch (error) {
    const fresh = refusalData<{ attemptId?: string }>(error)
    if (fresh?.attemptId) attempt.value = fresh.attemptId
    notice.value = refusalText(error)
    digits.value = []
    recoveryCode.value = ''
  }
  finally {
    working.value = false
  }
}
</script>

<template>
  <div
    data-test="mfa-challenge"
    class="space-y-4"
  >
    <div class="space-y-1">
      <h2 class="nnt-headline text-xl">
        Enter your code
      </h2>
      <p class="text-sm text-muted">
        Open your authenticator app and type the six digits it shows.
      </p>
    </div>

    <UAlert
      v-if="notice"
      color="error"
      variant="subtle"
      :description="notice"
    />

    <UPinInput
      v-model="digits"
      :length="CODE_LENGTH"
      :disabled="working"
      otp
      size="lg"
      autofocus
      @complete="answer($event.join(''))"
    />

    <UButton
      v-if="!usingRecoveryCode"
      variant="link"
      class="px-0"
      @click="usingRecoveryCode = true"
    >
      I do not have my authenticator
    </UButton>

    <form
      v-else
      class="space-y-2"
      @submit.prevent="answer(recoveryCode)"
    >
      <UFormField
        label="Recovery code"
        description="One of the codes you saved when you set up your authenticator."
      >
        <UInput
          v-model="recoveryCode"
          data-test="recovery-code"
          placeholder="XXXX-XXXX-XXXX"
          autocomplete="one-time-code"
        />
      </UFormField>
      <UButton
        type="submit"
        :loading="working"
      >
        Continue
      </UButton>
    </form>
  </div>
</template>
