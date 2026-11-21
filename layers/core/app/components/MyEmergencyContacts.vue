<!-- My emergency contacts (ID-17), on My account › Details: up to three people to ring, kept only
     while the person is on the members' side. For anyone else the endpoint answers "not found" and
     the section is not drawn. Every staff read is listed, with when, in what capacity and why. -->
<script setup lang="ts">
import { z } from 'zod'
import { emergencyContactsInput, MAX_EMERGENCY_CONTACTS } from '../../shared/emergency-contacts'
import type { RefusalView } from '../utils/refusal'

interface Contact { name: string, relationship: string | null, phone: string }
interface Answer { contacts: Contact[], changedAt: number | null, reads: Array<{ at: number, capacity: string, reason: string }> }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { dateTime } = useDates()
const toast = useToast()
const { data, refresh } = await useAPI<Answer>('/api/core/me/emergency-contacts', { key: 'core:me:emergency-contacts' })

const form = reactive<{ contacts: Array<{ name: string, relationship: string, phone: string }>, told: boolean }>({ contacts: [], told: false })
watch(() => data.value?.contacts, (contacts) => {
  if (!contacts) return
  form.contacts = contacts.map(c => ({ name: c.name, relationship: c.relationship ?? '', phone: c.phone }))
  form.told = contacts.length > 0
}, { immediate: true })

// The route's schema, with the confirmation held as a tick box until it is ticked.
const schema = emergencyContactsInput.extend({ told: z.boolean() }).refine(v => v.told || !v.contacts.length, { path: ['told'], message: t('core.me.contacts.told-needed') })
const formRef = useTemplateRef('formRef')
const uid = useId()
const saving = ref(false)
const refusal = ref<RefusalView | null>(null)

function add() {
  if (form.contacts.length < MAX_EMERGENCY_CONTACTS) form.contacts.push({ name: '', relationship: '', phone: '' })
}
function remove(index: number) {
  form.contacts.splice(index, 1)
}

async function save() {
  saving.value = true
  refusal.value = null
  try {
    await $api('/api/core/me/emergency-contacts', {
      method: 'PUT',
      body: { contacts: form.contacts.map(c => ({ name: c.name.trim(), relationship: c.relationship.trim() || null, phone: c.phone.trim() })), told: true },
    })
    toast.add({ title: t('core.me.contacts.saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formRef.value?.setErrors(fieldErrors(refusal.value))
  }
  finally {
    saving.value = false
  }
}

const REASONS = ['emergency', 'incident', 'welfare-follow-up', 'activity-check']
const reasonLabel = (reason: string) => REASONS.includes(reason) ? t(`core.person.contacts.reasons.${reason}`) : t('core.me.contacts.reason-unknown')
</script>

<template>
  <PageSection
    v-if="data"
    :title="t('core.me.contacts.title')"
    :description="t('core.me.contacts.intro', { count: MAX_EMERGENCY_CONTACTS })"
  >
    <UForm
      ref="formRef"
      :schema="schema"
      :state="form"
      class="space-y-6"
      novalidate
      @submit="save"
    >
      <RefusalNotice :refusal="refusal" />
      <p
        v-if="!form.contacts.length"
        class="text-sm text-muted"
      >
        {{ t('core.me.contacts.none') }}
      </p>
      <div
        v-for="(contact, index) in form.contacts"
        :key="index"
        role="group"
        :aria-labelledby="`${uid}-contact-${index}`"
        class="space-y-4"
      >
        <div class="flex items-center justify-between gap-3">
          <h3
            :id="`${uid}-contact-${index}`"
            class="font-medium text-highlighted"
          >
            {{ t('core.me.contacts.contact', { number: index + 1 }) }}
          </h3>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            :label="t('core.me.contacts.remove')"
            @click="remove(index)"
          />
        </div>
        <UFormField
          :name="`contacts.${index}.name`"
          :label="t('core.me.contacts.name')"
          required
        >
          <UInput
            v-model="contact.name"
            autocomplete="off"
            maxlength="120"
          />
        </UFormField>
        <UFormField
          :name="`contacts.${index}.relationship`"
          :label="t('core.me.contacts.relationship')"
          :help="t('core.me.contacts.relationship-help')"
        >
          <UInput
            v-model="contact.relationship"
            autocomplete="off"
            maxlength="40"
          />
        </UFormField>
        <UFormField
          :name="`contacts.${index}.phone`"
          :label="t('core.me.contacts.phone')"
          required
        >
          <UInput
            v-model="contact.phone"
            type="tel"
            autocomplete="off"
            maxlength="40"
          />
        </UFormField>
      </div>
      <UButton
        v-if="form.contacts.length < MAX_EMERGENCY_CONTACTS"
        color="neutral"
        variant="outline"
        icon="i-lucide-plus"
        :label="t('core.me.contacts.add')"
        @click="add"
      />
      <UFormField
        v-if="form.contacts.length"
        name="told"
        required
      >
        <UCheckbox
          v-model="form.told"
          :label="t('core.me.contacts.told')"
        />
      </UFormField>
      <UButton
        v-if="form.contacts.length || data.contacts.length"
        type="submit"
        :loading="saving"
        :label="t('core.me.contacts.save')"
      />
    </UForm>
    <div
      v-if="data.reads.length"
      class="space-y-2"
    >
      <h3 class="text-sm font-medium text-highlighted">
        {{ t('core.me.contacts.reads') }}
      </h3>
      <ul class="space-y-1 text-sm text-muted">
        <li
          v-for="read in data.reads"
          :key="read.at"
        >
          {{ t('core.me.contacts.read', { when: dateTime(read.at), capacity: read.capacity, reason: reasonLabel(read.reason) }) }}
        </li>
      </ul>
    </div>
  </PageSection>
</template>
