<!-- One of the person's own responses (FB-304): everything they answered, as they answered it. -->
<script setup lang="ts">
import type { Definition } from '../../../../shared/engine'
import type { ShownAnswer } from '../../../components/FormsAnswers.vue'

interface Own { response: { id: string, reference: string, submittedAt: number }, form: { title: string, slug: string }, definition: Definition, answers: ShownAnswer[] }
const { t } = useT()
const { dateTime } = useDates()
const route = useRoute()
const { data, error } = await useAPI<Own>(() => `/api/forms/mine/${encodeURIComponent(String(route.params.id))}`, { key: `forms:mine:${route.params.id}` })
if (error.value || !data.value) throw createError({ statusCode: 404, statusMessage: t('forms.screens.answer.not-found'), fatal: true })
const own = computed(() => data.value!)
</script>

<template>
  <PageFrame
    :title="own.form.title"
    :description="t('forms.screens.mine.sent-on', { when: dateTime(own.response.submittedAt), reference: own.response.reference })"
    :trail="[{ label: t('forms.navigation.mine.label'), to: '/account/forms' }]"
    width="reading"
  >
    <FormsAnswers
      :definition="own.definition"
      :answers="own.answers"
    />
  </PageFrame>
</template>
