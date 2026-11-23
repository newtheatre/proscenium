<!-- The passes bought with a booking, after checkout and on the booking's own page (Matt, 18
     November): the buyer holds them all, and when they bought more than one they can send each on to
     the person it is for, who becomes its holder and is emailed its code. Shown only with more than
     one pass, since one is the buyer's own. -->
<script setup lang="ts">
import { z } from 'zod'
import type { BookingPass } from '../utils/booking'

const props = defineProps<{ passes: BookingPass[], headers: Record<string, string> }>()
const emit = defineEmits<{ sent: [passes: BookingPass[]] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()

const sending = ref<string | null>(null)
const form = reactive({ email: '' })
const schema = z.object({ email: z.string().trim().email(t('box-office.manage.passes.email-invalid')).max(254) }) // not-policy: the route's bound
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

function open(id: string) {
  sending.value = id
  form.email = ''
  refusal.value = null
}
async function send(pass: BookingPass) {
  refusal.value = null
  try {
    const done = await $api<{ passes: BookingPass[] }>('/api/box-office/orders/link/send-pass', { method: 'POST', body: { passId: pass.id, email: form.email.trim() }, headers: { ...props.headers, 'idempotency-key': crypto.randomUUID() } })
    emit('sent', done.passes)
    toast.add({ title: t('box-office.manage.passes.sent', { name: pass.name, email: form.email.trim() }), color: 'success' })
    sending.value = null
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <section
    v-if="passes.length > 1"
    class="space-y-3"
  >
    <div>
      <h2 class="text-lg font-semibold">
        {{ t('box-office.manage.passes.title') }}
      </h2>
      <p class="text-sm text-muted">
        {{ t('box-office.manage.passes.help') }}
      </p>
    </div>
    <ul class="space-y-2">
      <li
        v-for="pass in passes"
        :key="pass.id"
        class="space-y-3 rounded-md border border-default px-3 py-2"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="flex min-w-0 flex-col">
            <span>{{ t('box-office.manage.passes.name', { name: pass.name, price: pass.priceName }) }}</span>
            <span class="text-sm text-muted">{{ pass.buyers ? t('box-office.manage.passes.yours', { code: pass.code ?? '' }) : t('box-office.manage.passes.sent-on') }}</span>
          </span>
          <UButton
            v-if="pass.buyers && sending !== pass.id"
            color="neutral"
            variant="outline"
            icon="i-lucide-send"
            :label="t('box-office.manage.passes.send')"
            @click="open(pass.id)"
          />
        </div>
        <UForm
          v-if="sending === pass.id"
          :schema="schema"
          :state="form"
          novalidate
          class="space-y-2"
          @submit="send(pass)"
        >
          <UFormField
            name="email"
            :label="t('box-office.manage.passes.email')"
            :help="t('box-office.manage.passes.email-help')"
            :error="refusal?.reason"
          >
            <div class="flex flex-wrap gap-2">
              <UInput
                v-model="form.email"
                type="email"
                autocomplete="off"
                maxlength="254"
                class="min-w-0 flex-1"
              />
              <UButton
                type="submit"
                :label="t('box-office.manage.passes.send-button')"
                loading-auto
              />
              <UButton
                color="neutral"
                variant="ghost"
                :label="t('core.form.cancel')"
                @click="sending = null"
              />
            </div>
          </UFormField>
        </UForm>
      </li>
    </ul>
  </section>
</template>
