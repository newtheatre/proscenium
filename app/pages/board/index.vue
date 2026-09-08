<script setup lang="ts">
import { boardJoinForm } from '#shared/utils/backstage'

// No account, no personal data: the code and a display label are the whole of the form
// (E-120 criterion 1). A cookie, never `localStorage`, which is `useNightCache`'s alone.
const state = reactive({ code: '', label: '' })
const joining = ref(false)
const failure = ref<string | null>(null)
const joined = ref<{ venueName: string } | null>(null)
const deviceToken = useCookie<string | null>('nnt-backstage-token', { maxAge: 60 * 60 * 24, sameSite: 'lax' })

async function join(): Promise<void> {
  joining.value = true
  failure.value = null
  try {
    const answered = await $fetch<{ token: string, venueName: string }>('/api/board/join', {
      method: 'POST',
      body: state,
    })
    deviceToken.value = answered.token
    joined.value = { venueName: answered.venueName }
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    joining.value = false
  }
}

useSeoMeta({ title: 'Backstage board' })
</script>

<template>
  <UContainer class="max-w-md py-16">
    <UPageCard>
      <div
        v-if="joined"
        data-test="board-joined"
        class="space-y-3"
      >
        <h1 class="nnt-headline text-xl">
          You're on the board
        </h1>
        <p class="text-muted">
          {{ joined.venueName }}, tonight.
        </p>
      </div>

      <UForm
        v-else
        :schema="boardJoinForm"
        :state="state"
        class="space-y-4"
        data-test="board-join-form"
        @submit="join"
      >
        <h1 class="nnt-headline text-xl">
          Join tonight's board
        </h1>
        <p class="text-muted">
          Ask the duty manager for tonight's code.
        </p>

        <UAlert
          v-if="failure"
          data-test="board-join-failure"
          color="error"
          variant="subtle"
          :description="failure"
        />

        <UFormField
          label="Code"
          name="code"
        >
          <UInput
            v-model="state.code"
            inputmode="numeric"
            autocomplete="one-time-code"
            class="w-full font-mono text-lg tracking-widest"
            data-test="board-code-input"
          />
        </UFormField>

        <UFormField
          label="Your name or role"
          name="label"
          description="Shown to the duty manager, nothing else. Not validated against anything."
        >
          <UInput
            v-model="state.label"
            class="w-full"
            data-test="board-label-input"
          />
        </UFormField>

        <UButton
          type="submit"
          :loading="joining"
          data-test="board-join-submit"
          block
        >
          Join
        </UButton>
      </UForm>
    </UPageCard>
  </UContainer>
</template>
